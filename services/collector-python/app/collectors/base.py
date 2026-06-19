from abc import ABC, abstractmethod
from typing import Optional


class CollectResult:
    def __init__(self):
        self.records_found: int = 0
        self.records_ingested: int = 0
        self.error_message: Optional[str] = None


class BaseCollector(ABC):
    def __init__(self, source: dict):
        self.source = source
        self.config = source.get("config", {})

    @abstractmethod
    def collect(self) -> CollectResult:
        ...
