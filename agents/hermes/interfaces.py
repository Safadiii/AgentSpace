from typing import Protocol

from agents.hermes.state import Classification, EmailMessage, HeuristicSignals
from storage.hermes.models import EmailAction


class MailProvider(Protocol):
    async def latest_unread_id(self) -> str | None: ...

    async def get_message(self, message_id: str) -> EmailMessage: ...

    async def apply(
        self, message_id: str, action: EmailAction, priority: int | None = None
    ) -> None: ...

    async def undo(self, message_id: str, action: EmailAction) -> None: ...


class EmailClassifier(Protocol):
    async def classify(
        self, message: EmailMessage, signals: HeuristicSignals
    ) -> Classification: ...
