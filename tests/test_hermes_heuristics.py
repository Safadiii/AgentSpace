import base64

from agents.hermes.heuristics import analyze
from agents.hermes.state import EmailMessage
from backend.hermes.providers.gmail import parse_message
from storage.hermes.models import EmailCategory


def make(**overrides) -> EmailMessage:
    base = dict(id="1", sender="Shop <deals@shop.com>", sender_email="deals@shop.com",
                subject="hello", body_text="hi there")
    return EmailMessage(**{**base, **overrides})


def test_phishing_is_decisive_scam():
    msg = make(
        sender_email="security@paypa1-support.com",
        subject="Urgent action required: verify your account",
        body_text="Your account has been suspended. Confirm your identity now.",
        links=["http://bit.ly/abc", "http://192.168.4.4/login"],
        headers={"authentication-results": "spf=fail dkim=fail",
                 "reply-to": "x@gmail.com"},
    )
    assert analyze(msg).decisive_category == EmailCategory.SCAM


def test_promotion_with_unsubscribe_is_decisive_ad():
    msg = make(labels=["CATEGORY_PROMOTIONS"],
               headers={"list-unsubscribe": "<mailto:u@shop.com>"})
    assert analyze(msg).decisive_category == EmailCategory.ADVERTISEMENT


def test_receipt_with_only_unsubscribe_is_not_decisive():
    msg = make(headers={"list-unsubscribe": "<mailto:u@shop.com>"})
    assert analyze(msg).decisive_category is None


def test_plain_personal_mail_has_no_signals():
    signals = analyze(make(body_text="Can we move lunch to 1pm?"))
    assert signals.scam_score == 0 and signals.ad_score == 0


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def test_parse_message_extracts_headers_body_and_html_links():
    raw = {
        "id": "abc", "threadId": "t1", "snippet": "snip", "labelIds": ["INBOX"],
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [
                {"name": "From", "value": "Shop <Deals@Shop.com>"},
                {"name": "Subject", "value": "Sale"},
                {"name": "X-Ignored", "value": "nope"},
            ],
            "parts": [{
                "mimeType": "text/html",
                "body": {"data": _b64('<p>Hi <a href="https://shop.com/x">link</a></p>')},
            }],
        },
    }
    msg = parse_message(raw)
    assert msg.sender_email == "deals@shop.com"
    assert msg.subject == "Sale" and "x-ignored" not in msg.headers
    assert msg.body_text == "Hi link"
    assert msg.links == ["https://shop.com/x"]
