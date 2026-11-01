import re
from email.utils import parseaddr
from urllib.parse import urlparse

from agents.hermes.state import Classification, EmailMessage, HeuristicSignals
from storage.hermes.models import EmailCategory

SCAM_PHRASES = (
    "verify your account", "account has been suspended", "account will be closed",
    "confirm your identity", "unusual sign-in activity", "password expires",
    "you have won", "claim your prize", "gift card", "wire transfer",
    "urgent action required", "act immediately", "crypto", "bitcoin",
    "inheritance", "beneficiary", "tax refund", "invoice attached",
)
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy"}
IP_HOST = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

DECISIVE_SCAM = 0.80
DECISIVE_AD = 0.80
DECISIVE_AD_CONFIDENCE = 0.90


def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def _suspicious(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return (
        host in SHORTENERS
        or bool(IP_HOST.match(host))
        or "xn--" in host          # punycode: look-alike domains
    )


def analyze(msg: EmailMessage) -> HeuristicSignals:
    h = msg.headers
    text = f"{msg.subject}\n{msg.body_text}".lower()
    reasons: list[str] = []

    auth = h.get("authentication-results", "").lower()
    auth_failed = any(f"{check}=fail" in auth for check in ("spf", "dkim", "dmarc"))
    if auth_failed:
        reasons.append("failed SPF/DKIM/DMARC")

    reply_to = parseaddr(h.get("reply-to", ""))[1]
    reply_to_mismatch = bool(reply_to) and _domain(reply_to) != _domain(msg.sender_email)
    if reply_to_mismatch:
        reasons.append("Reply-To domain differs from sender")

    suspicious_links = [u for u in msg.links if _suspicious(u)][:5]
    if suspicious_links:
        reasons.append("shortened/IP/look-alike links")

    phrases = [p for p in SCAM_PHRASES if p in text]
    if phrases:
        reasons.append(f"scam phrases: {', '.join(phrases[:3])}")

    has_unsubscribe = "list-unsubscribe" in h
    is_bulk = h.get("precedence", "").lower() in {"bulk", "list", "junk"}
    in_promotions = "CATEGORY_PROMOTIONS" in msg.labels
    markers = [
        name for name, hit in (
            ("List-Unsubscribe header", has_unsubscribe),
            ("Gmail Promotions category", in_promotions),
            ("Precedence: bulk", is_bulk),
        ) if hit
    ]
    if markers:
        reasons.append("bulk mail: " + ", ".join(markers))

    scam_score = min(
        1.0,
        0.35 * auth_failed
        + 0.20 * reply_to_mismatch
        + 0.15 * bool(suspicious_links)
        + min(0.45, 0.15 * len(phrases)),
    )
    ad_score = min(
        1.0, 0.5 * has_unsubscribe + 0.3 * in_promotions + 0.2 * is_bulk
    )

    decisive = None
    if scam_score >= DECISIVE_SCAM:
        decisive = EmailCategory.SCAM
    elif ad_score >= DECISIVE_AD and scam_score < 0.30:
        decisive = EmailCategory.ADVERTISEMENT

    return HeuristicSignals(
        has_unsubscribe=has_unsubscribe, is_bulk=is_bulk, in_promotions=in_promotions,
        auth_failed=auth_failed, reply_to_mismatch=reply_to_mismatch,
        suspicious_links=suspicious_links, scam_phrases=phrases,
        scam_score=scam_score, ad_score=ad_score,
        decisive_category=decisive, reasons=reasons,
    )


def fast_classification(signals: HeuristicSignals) -> Classification:
    """Used when the rules are decisive and the LLM isn't needed."""
    is_scam = signals.decisive_category == EmailCategory.SCAM
    # A decisive ad (unsubscribe header AND Gmail Promotions) is as sure as the
    # rules get; give it a fixed confidence that clears the policy's trash bar.
    return Classification(
        category=signals.decisive_category or EmailCategory.NORMAL,
        priority=4,
        confidence=signals.scam_score if is_scam else DECISIVE_AD_CONFIDENCE,
        reason="Rules: " + "; ".join(signals.reasons),
    )
