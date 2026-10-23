
import asyncio
from types import SimpleNamespace

import pytest

from backend.research.providers.topic_explorer import (
    NVIDIATopicExplorer,
)


class FakeLLM:
    async def ainvoke(self, messages):
        return SimpleNamespace(
            content="Federated Learning for Medical Imaging"
        )


def test_topic_explorer():

    explorer = NVIDIATopicExplorer(FakeLLM())

    topic = asyncio.run(
        explorer.suggest_topic(
            base_topic="Federated Learning",
            angle="applications",
        )
    )

    assert topic == "Federated Learning for Medical Imaging"


def test_invalid_angle():

    explorer = NVIDIATopicExplorer(FakeLLM())

    with pytest.raises(ValueError):
        asyncio.run(
            explorer.suggest_topic(
                base_topic="Federated Learning",
                angle="invalid",
            )
        )
