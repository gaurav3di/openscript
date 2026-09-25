"""Immutable contributions with bounded append copying and cheap checkpoints."""

from dataclasses import dataclass
from typing import Optional, Sequence

from .values import Value

_WIDTH = 32


@dataclass(frozen=True, slots=True)
class _Chunk:
    values: tuple[Value, ...]
    prior: Optional["_Chunk"]


@dataclass(frozen=True, slots=True)
class ContributionHistory:
    """A version shares its sealed prefix with previous versions and forks."""

    head: Optional[_Chunk] = None
    tail: tuple[Value, ...] = ()
    count: int = 0
    maximum: int = 0
    seed_count: int = 0

    def append(self, value: Value, length: Optional[int]) -> "ContributionHistory":
        full = len(self.tail) == _WIDTH
        head = _Chunk(self.tail, self.head) if full else self.head
        tail = (value,) if full else self.tail + (value,)
        maximum = max(self.maximum, length or 0)
        # Recursive seeds retain their previous bounded-buffer availability.
        seed_count = min(self.seed_count + 1, max(maximum, 1))
        return ContributionHistory(head, tail, self.count + 1, maximum, seed_count)

    def __deepcopy__(self, memo):
        """All reachable state is immutable, so checkpoint copying shares it."""
        return self

    def view(self, length: int) -> "ContributionView":
        size = min(length, self.count)
        chunks = []
        remaining = size - len(self.tail)
        head = self.head
        while remaining > 0 and head is not None:
            chunks.append(head.values)
            head = head.prior
            remaining -= _WIDTH
        return ContributionView(self, tuple(chunks), size)


@dataclass(frozen=True, slots=True)
class ContributionView(Sequence[Value]):
    """A transient oldest-first sequence indexing only the requested chunks."""

    history: ContributionHistory
    chunks: tuple[tuple[Value, ...], ...]
    size: int

    def __len__(self):
        return self.size

    def __getitem__(self, index):
        if isinstance(index, slice):
            return [self[at] for at in range(*index.indices(self.size))]
        if index < 0:
            index += self.size
        if index < 0 or index >= self.size:
            raise IndexError(index)
        back = self.size - 1 - index
        tail = self.history.tail
        if back < len(tail):
            return tail[len(tail) - 1 - back]
        before = back - len(tail)
        return self.chunks[before // _WIDTH][_WIDTH - 1 - before % _WIDTH]
