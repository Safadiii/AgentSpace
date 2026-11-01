import re
from email.utils import parseaddr

from agents.hermes.state import Classification, EmailMessage
from storage.hermes.models import EmailAction, EmailCategory

SPAM_MIN_CONFIDENCE = 0.70
TRASH_MIN_CONFIDENCE = 0.85


# Protecting one of these would shield every scammer using that provider.
FREE_MAIL_DOMAINS = frozenset({
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
    "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
})
_RULE_RE = re.compile(r"^([^@\s]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$")


def normalize_protected(raw: str) -> str:
    """User input -> canonical rule ("Name <a@b.com>", "@b.com", " B.com " all work).
    Raises ValueError if it isn't a valid address/domain or is a free-mail domain."""
    value = (parseaddr(raw)[1] or raw).strip().lower().lstrip("@")
    if not _RULE_RE.match(value):
        raise ValueError("Enter an email address (a@b.com) or a domain (b.com)")
    if value in FREE_MAIL_DOMAINS:
        raise ValueError(
            f"{value} is a public mail provider; protect the full address instead"
        )
    return value


def is_protected(sender_email: str, protected: frozenset[str]) -> bool:
    """Entries with "@" match an exact address; bare entries match that domain
    and its subdomains (aioriented.com also covers news.aioriented.com)."""
    domain = sender_email.rsplit("@", 1)[-1]
    return any(
        sender_email == entry
        or ("@" not in entry and (domain == entry or domain.endswith("." + entry)))
        for entry in protected
    )


def decide_action(
    message: EmailMessage,
    classification: Classification,
    vip_senders: frozenset[str] = frozenset(),
) -> EmailAction:
    # Protected senders are never trashed or spammed, whatever the classifier says.
    if is_protected(message.sender_email, vip_senders):
        return (
            EmailAction.LABEL_PRIORITY
            if classification.category == EmailCategory.PRIORITY
            else EmailAction.KEEP
        )

    category, confidence = classification.category, classification.confidence

    if category == EmailCategory.SCAM:
        return EmailAction.SPAM if confidence >= SPAM_MIN_CONFIDENCE else EmailAction.NEEDS_REVIEW
    if category == EmailCategory.ADVERTISEMENT:
        return EmailAction.TRASH if confidence >= TRASH_MIN_CONFIDENCE else EmailAction.KEEP
    if category == EmailCategory.PRIORITY:
        return EmailAction.LABEL_PRIORITY
    return EmailAction.KEEP
