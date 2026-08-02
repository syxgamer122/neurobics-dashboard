import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  startRound,
  submitRound,
  type Profile,
  type RoundGame,
  type RoundTicket,
  type SubmittedRound,
} from "../lib/api";
import { sanitizeRating, pullUpRating, type AxisRatings } from "../lib/scoring";
import { AXIS_META, type AxisKey } from "../lib/axes";
import type {
  RoundAxisRow,
  RoundResult,
} from "../components/ui/round-result-overlay";
import { logError } from "../lib/logger";

function applyAxes(
  profile: Profile,
  axes: AxisRatings,
  serverProfile: Profile | null | undefined,
  labels: Record<AxisKey, string>,
) {
  const rows: RoundAxisRow[] = [];

  (Object.keys(AXIS_META) as AxisKey[]).forEach((key) => {
    const round = axes[key];
    if (round === null) return;
    const meta = AXIS_META[key];
    const prev = sanitizeRating(
      profile[meta.column as keyof Profile] as number | null,
    );
    const next = serverProfile
      ? sanitizeRating(
          serverProfile[meta.column as keyof Profile] as number | null,
        )
      : pullUpRating(prev, round);
    rows.push({
      label: labels[key],
      color: meta.color,
      round,
      prev,
      next,
    });
  });

  return { rows };
}

export type UseRoundSubmissionArgs = {
  selectedGame: RoundGame | null;
  profileRef: React.MutableRefObject<Profile | null>;
  setProfile: (p: Profile) => void;
  setRoundResult: (r: RoundResult | null) => void;
  setGamificationKey: React.Dispatch<React.SetStateAction<number>>;
  axisLabels: () => Record<AxisKey, string>;
  saveFailedLabel: string;
  retrySendLabel: string;
};

/**
 * Ticket lifecycle + telemetry submit.
 *
 * Hanh vi v7:
 * - Warm 1 ticket khi mo game.
 * - beginPlay reuse ticket (khong force mint).
 * - completeRound khong mint ticket moi trong finally.
 * - Retry giu ticket neu loi mang chua ro; xoa khi server bao ticket chet.
 */
export function useRoundSubmission({
  selectedGame,
  profileRef,
  setProfile,
  setRoundResult,
  setGamificationKey,
  axisLabels,
  saveFailedLabel,
  retrySendLabel,
}: UseRoundSubmissionArgs) {
  const roundTicketsRef = useRef<Partial<Record<RoundGame, RoundTicket>>>({});

  const prepareRound = useCallback(
    async (
      game: RoundGame,
      opts?: { force?: boolean },
    ): Promise<RoundTicket> => {
      if (!opts?.force) {
        const existing = roundTicketsRef.current[game];
        if (existing && Date.parse(existing.expiresAt) > Date.now())
          return existing;
      }
      const ticket = await startRound(game);
      roundTicketsRef.current[game] = ticket;
      return ticket;
    },
    [],
  );

  useEffect(() => {
    if (!selectedGame) return;
    prepareRound(selectedGame).catch((err) =>
      logError("Prepare round failed:", err),
    );
  }, [selectedGame, prepareRound]);

  const beginPlay = useCallback(
    (game: RoundGame) => {
      void prepareRound(game).catch((err) =>
        logError("Play-start ticket prepare failed:", err),
      );
    },
    [prepareRound],
  );

  const completeRound = useCallback(
    async (game: RoundGame, telemetry: unknown): Promise<SubmittedRound> => {
      const ticket = roundTicketsRef.current[game];
      if (!ticket) {
        void prepareRound(game, { force: true }).catch(() => {});
        throw new Error("Round ticket missing. Start the game again.");
      }
      if (Date.parse(ticket.expiresAt) <= Date.now()) {
        delete roundTicketsRef.current[game];
        void prepareRound(game, { force: true }).catch(() => {});
        throw new Error("Round ticket expired. Start the game again.");
      }
      try {
        const result = await submitRound(ticket.roundId, game, telemetry);
        setProfile(result.profile);
        delete roundTicketsRef.current[game];
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          /already submitted|expired|ticket not found|round rejected/i.test(msg)
        )
          delete roundTicketsRef.current[game];
        throw err;
      }
    },
    [prepareRound, setProfile],
  );

  const submitTelemetryRef = useRef<
    ((game: RoundGame, tel: unknown) => Promise<boolean>) | null
  >(null);

  const submitTelemetry = useCallback(
    async (game: RoundGame, tel: unknown): Promise<boolean> => {
      const baseline = profileRef.current;
      try {
        const result = await completeRound(game, tel);
        const { rows } = applyAxes(
          baseline ?? result.profile,
          result.axes,
          result.profile,
          axisLabels(),
        );
        setRoundResult({
          game,
          timeMs: result.timeMs,
          label: result.label,
          headline: result.headline,
          rows,
          xpAwarded: result.xpAwarded,
          xpLevel: result.level,
          leveledUp: result.leveledUp,
        });
        setGamificationKey((k) => k + 1);
        return true;
      } catch (err) {
        logError(`${game} submit failed:`, err);
        const msg = err instanceof Error ? err.message : String(err);
        const ticketGone = /already submitted|expired|ticket not found/i.test(
          msg,
        );

        if (!ticketGone) {
          toast.error(saveFailedLabel, {
            action: {
              label: retrySendLabel,
              onClick: () => {
                void submitTelemetryRef.current?.(game, tel);
              },
            },
            duration: 15000,
          });
        } else {
          toast.error(/ticket/i.test(msg) ? msg : saveFailedLabel);
        }
        return false;
      }
    },
    [
      completeRound,
      saveFailedLabel,
      retrySendLabel,
      axisLabels,
      profileRef,
      setRoundResult,
      setGamificationKey,
    ],
  );

  useEffect(() => {
    submitTelemetryRef.current = submitTelemetry;
  }, [submitTelemetry]);

  const makeGameHandler = useCallback(
    (game: RoundGame) => async (tel: unknown) => {
      await submitTelemetry(game, tel);
    },
    [submitTelemetry],
  );

  return {
    beginPlay,
    makeGameHandler,
    prepareRound,
    completeRound,
    submitTelemetry,
  };
}
