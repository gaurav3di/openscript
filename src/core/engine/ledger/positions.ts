/**
 * The positions a leg holds, folded from settled fills and from nothing else,
 * `stdlib.md` 17.1 and 17.7.
 *
 * **A fill settles the position its own order names, never whichever position
 * the leg holds now.** That is what the position reference is for: during a
 * flip a leg holds two positions at once, the outgoing one and its replacement,
 * and a fill that arrives late would otherwise be applied to the position that
 * replaced the one it belonged to.
 *
 * **Reducing a position does not move its average price.** The units that leave
 * leave at the price the position was opened at, so what remains is still the
 * average of what was bought. An engine that took the closing fill's price into
 * the average would report an entry at a price nothing was entered at, and
 * every level measured from the entry would be measured from that.
 *
 * Nothing here is money. Realised profit, equity and the trade list are
 * `stdlib.md` 17.4's planned entries, and this holds the two facts the five
 * position calls of this release read: how much is held, and at what average.
 */

interface Held {
  /** Signed: positive long, negative short. */
  size: number;
  /** Signed cost of the open position, so cost over size is its average. */
  cost: number;
  /** Whether this position has ever held anything, which is what ends it. */
  opened: boolean;
}

export class Positions {
  private readonly held = new Map<number, Held>();
  private next = 1;
  /** The position an order placed now attaches to, or none while flat. */
  private attaching: number | null = null;

  /**
   * The reference an order placed now carries.
   *
   * Minted when the leg is flat and nothing has been sent against a position
   * yet, and kept while one is being opened, so two entries sent on two bars
   * before either fills belong to one position rather than to two.
   */
  reference(): number {
    if (this.attaching === null) this.attaching = this.mint();
    return this.attaching;
  }

  /**
   * The position an order placed now would attach to, or none while flat.
   *
   * The same answer as `reference()` and without minting one, for a rule that
   * has to count what a position already holds before deciding whether an
   * order may join it.
   */
  current(): number | null {
    return this.attaching;
  }

  /** A fresh position, for the replacement half of a flip. */
  mint(): number {
    const ref = this.next;
    this.next += 1;
    this.held.set(ref, { size: 0, cost: 0, opened: false });
    this.attaching = ref;
    return ref;
  }

  /** Step 6 of the fold: `units` at `price` settle against one position. */
  settle(ref: number, units: number, price: number): void {
    const position = this.held.get(ref) ?? { size: 0, cost: 0, opened: false };
    this.held.set(ref, position);
    const before = position.size;

    if (before === 0 || Math.sign(units) === Math.sign(before)) {
      position.size = before + units;
      position.cost += units * price;
    } else {
      const average = position.cost / before;
      const after = before + units;
      position.size = after;
      // A destination that filled more than the order asked takes the leg
      // through zero. The remainder is a position in the other direction and it
      // opened at this fill's price, which is the truthful reading of what the
      // account now holds. Dropping it would leave the strategy blind to a
      // position it is carrying.
      const held = Math.sign(after) === Math.sign(before) ? average : price;
      position.cost = after === 0 ? 0 : after * held;
    }

    if (position.size !== 0) position.opened = true;
    // The position ends when its own quantity returns to zero through settled
    // fills. The leg going flat is not the test: during a flip the outgoing
    // position reaching zero leaves the replacement attaching.
    if (this.attaching === ref && position.size === 0 && position.opened) this.attaching = null;
  }

  /** The leg's net position in units, `0` while flat. */
  size(): number {
    let total = 0;
    for (const position of this.held.values()) total += position.size;
    return total;
  }

  /**
   * The average price of what the leg holds, absent while flat.
   *
   * Absent rather than zero, because zero is a price and a script comparing
   * against it would take a branch that looks correct (`stdlib.md` 17.4).
   *
   * **Averaged over the positions that make up what the leg holds**, which is
   * the ones on the side of its net, and not over every position open at once.
   * A leg holds more than one whenever an order that opposes it is outstanding:
   * during a flip it holds the outgoing position and its replacement, and where
   * the engine could not size the opposing order against the leg it holds the
   * position that order opened beside the one it was meant to replace. Summed
   * across both, the cost of a position on the way out is subtracted from the
   * cost of the one on the way in, and the quotient is a price nothing was
   * entered at: three hundred bought at one hundred with two hundred and
   * twenty five sold at one hundred and ten reported an entry at seventy, and
   * every level a script measures from the entry would have been measured from
   * it. Reducing a position does not move its average, and that is the same
   * sentence read across a leg rather than inside one position.
   */
  avgPrice(): number | null {
    const net = this.size();
    if (net === 0) return null;
    const side = Math.sign(net);
    let size = 0;
    let cost = 0;
    for (const position of this.held.values()) {
      if (Math.sign(position.size) !== side) continue;
      size += position.size;
      cost += position.cost;
    }
    return size === 0 ? null : cost / size;
  }
}
