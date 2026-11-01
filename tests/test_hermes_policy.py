import pytest

from agents.hermes.policy import decide_action, normalize_protected
from agents.hermes.state import Classification, EmailMessage
from storage.hermes.models import EmailAction, EmailCategory


def msg(email="a@b.com") -> EmailMessage:
    return EmailMessage(id="1", sender=email, sender_email=email)


def cls(category, confidence, priority=3) -> Classification:
    return Classification(category=category, priority=priority,
                          confidence=confidence, reason="t")


def test_confident_ad_is_trashed():
    assert decide_action(msg(), cls(EmailCategory.ADVERTISEMENT, 0.9)) == EmailAction.TRASH


def test_unsure_ad_stays_in_inbox():
    assert decide_action(msg(), cls(EmailCategory.ADVERTISEMENT, 0.6)) == EmailAction.KEEP


def test_scam_goes_to_spam_and_unsure_scam_needs_review():
    assert decide_action(msg(), cls(EmailCategory.SCAM, 0.8)) == EmailAction.SPAM
    assert decide_action(msg(), cls(EmailCategory.SCAM, 0.4)) == EmailAction.NEEDS_REVIEW


def test_vip_is_never_trashed():
    vips = frozenset({"boss@co.com"})
    result = decide_action(msg("boss@co.com"), cls(EmailCategory.SCAM, 0.99), vips)
    assert result == EmailAction.KEEP


def test_priority_is_labelled():
    assert decide_action(msg(), cls(EmailCategory.PRIORITY, 0.9, 1)) == EmailAction.LABEL_PRIORITY


def test_protected_domain_covers_subdomains_but_not_lookalikes():
    protected = frozenset({"aioriented.com"})
    ad = cls(EmailCategory.ADVERTISEMENT, 0.95)
    assert decide_action(msg("a@aioriented.com"), ad, protected) == EmailAction.KEEP
    assert decide_action(msg("a@news.aioriented.com"), ad, protected) == EmailAction.KEEP
    assert decide_action(msg("a@evil-aioriented.com"), ad, protected) == EmailAction.TRASH


def test_normalize_accepts_addresses_and_domains():
    assert normalize_protected("  AIOriented.com ") == "aioriented.com"
    assert normalize_protected("@Co.com") == "co.com"
    assert normalize_protected("Boss <Boss@Co.com>") == "boss@co.com"


@pytest.mark.parametrize("bad", ["", "nonsense", "a b@c.com", "gmail.com", "@outlook.com"])
def test_normalize_rejects_invalid_and_free_mail_domains(bad):
    with pytest.raises(ValueError):
        normalize_protected(bad)


def test_full_freemail_address_is_allowed():
    assert normalize_protected("friend@gmail.com") == "friend@gmail.com"
