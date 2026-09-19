/**
 * The order the channel table is written in.
 *
 * `compiled-program.md` 2.7 says only that a channel's `id` equals its position
 * in the array, so any order is a legal program. The worked example of 12.2 is
 * the whole of the evidence about which order to choose, and it shows a plot
 * declared on the last line of the script holding channel 0 while a `signal`
 * three lines above it holds channel 1. So the specification's own order is not the
 * order the declarations are met in; it is the order `outputs` lists its
 * fields.
 *
 * That is the rule applied here, and it is applied as a renumbering after the
 * fact rather than by emitting in two passes: a channel's index is needed the
 * moment an `EMIT` is written, and an emitter that walked the file twice to
 * learn it would have two places that decide what a declaration is.
 */
import type { Emitter } from './context.js';
import type { Channel, Instruction, Outputs } from './program.js';

/** The channels each output group owns, in the order `outputs` lists them. */
function declaredOrder(e: Emitter): readonly number[] {
  const order: number[] = [];
  const take = (channel: number | null | undefined): void => {
    if (typeof channel === 'number' && !order.includes(channel)) order.push(channel);
  };

  for (const plot of e.plots) {
    take(plot.channel);
    take(plot.colorChannel);
    if (plot.ohlc === null) continue;
    take(plot.ohlc.open);
    take(plot.ohlc.high);
    take(plot.ohlc.low);
    take(plot.ohlc.close);
    take(plot.ohlc.colorUpChannel);
    take(plot.ohlc.colorDownChannel);
    take(plot.ohlc.wickColorChannel);
    take(plot.ohlc.borderColorChannel);
  }
  for (const band of e.fills) {
    take(band.colorUpChannel);
    take(band.colorDownChannel);
  }
  for (const level of e.levels) take(level.channel);
  for (const marker of e.markers) take(marker.channel);
  for (const alert of e.alerts) {
    take(alert.condChannel);
    take(alert.messageChannel);
  }
  take(e.barColor?.channel);
  take(e.background?.channel);

  // A channel no declaration reached would be one nothing can draw, so this is
  // insurance against a future surface rather than a case that happens today.
  for (let id = 0; id < e.layout.channels.length; id += 1) take(id);
  return order;
}

export interface ChannelOrder {
  readonly channels: readonly Channel[];
  readonly names: readonly string[];
  /** The new index of each old one, for rewriting an `EMIT` and a declaration. */
  readonly moved: readonly number[];
}

export function orderChannels(e: Emitter): ChannelOrder {
  const order = declaredOrder(e);
  const moved = new Array<number>(e.layout.channels.length).fill(0);
  order.forEach((old, index) => {
    moved[old] = index;
  });

  const channels = order.map((old, index) => {
    const channel = e.layout.channels[old];
    return {
      id: index,
      type: channel?.type ?? 'number',
      defer: channel?.defer ?? false,
      once: channel?.once ?? false,
    } as Channel;
  });

  return { channels, names: order.map((old) => e.layout.channelNames[old] ?? ''), moved };
}

export function renumberCode(
  code: readonly Instruction[],
  moved: readonly number[],
): readonly Instruction[] {
  return code.map((instruction) =>
    instruction[0] === 'EMIT'
      ? (['EMIT', moved[instruction[1] ?? 0] ?? 0] as Instruction)
      : instruction,
  );
}

function move(moved: readonly number[], channel: number | null): number | null {
  return channel === null ? null : (moved[channel] ?? channel);
}

export function renumberOutputs(e: Emitter, moved: readonly number[]): Outputs {
  return {
    plots: e.plots.map((plot) => ({
      ...plot,
      channel: move(moved, plot.channel) ?? plot.channel,
      colorChannel: move(moved, plot.colorChannel),
      ohlc:
        plot.ohlc === null
          ? null
          : {
              ...plot.ohlc,
              open: move(moved, plot.ohlc.open) ?? plot.ohlc.open,
              high: move(moved, plot.ohlc.high) ?? plot.ohlc.high,
              low: move(moved, plot.ohlc.low) ?? plot.ohlc.low,
              close: move(moved, plot.ohlc.close) ?? plot.ohlc.close,
              colorUpChannel: move(moved, plot.ohlc.colorUpChannel),
              colorDownChannel: move(moved, plot.ohlc.colorDownChannel),
              wickColorChannel: move(moved, plot.ohlc.wickColorChannel),
              borderColorChannel: move(moved, plot.ohlc.borderColorChannel),
            },
    })),
    fills: e.fills.map((band) => ({
      ...band,
      colorUpChannel: move(moved, band.colorUpChannel),
      colorDownChannel: move(moved, band.colorDownChannel),
    })),
    levels: e.levels.map((level) => ({
      ...level,
      channel: move(moved, level.channel) ?? level.channel,
    })),
    markers: e.markers.map((marker) => ({
      ...marker,
      channel: move(moved, marker.channel) ?? marker.channel,
    })),
    tables: e.tables,
    alerts: e.alerts.map((alert) => ({
      ...alert,
      condChannel: move(moved, alert.condChannel) ?? alert.condChannel,
      messageChannel: move(moved, alert.messageChannel),
    })),
    barColor: e.barColor === null ? null : { channel: move(moved, e.barColor.channel) ?? 0 },
    background: e.background === null ? null : { channel: move(moved, e.background.channel) ?? 0 },
  };
}
