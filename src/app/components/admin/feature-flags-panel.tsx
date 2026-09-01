import { useState, useMemo } from "react";
import {
  Sliders,
  Check,
  RotateCcw,
  Search,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useFeatureFlags } from "../../hooks/use-feature-flags";
import { ADMIN_COLORS } from "./constants";
import { ActionBtn, Panel } from "./ui";

const { green, blue, amber, red, purple } = ADMIN_COLORS;

interface FeatureFlagsPanelProps {
  onLog?: (msg: string) => void;
}

export function FeatureFlagsPanel({ onLog }: FeatureFlagsPanelProps) {
  const { flags, loading, error, updateFlag, refreshFlags, setAllFlags } =
    useFeatureFlags();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "enabled" | "disabled" | "rollout"
  >("all");
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [localRollouts, setLocalRollouts] = useState<Record<string, number>>(
    {},
  );

  const flagList = useMemo(() => {
    return Object.values(flags).sort((a, b) => a.key.localeCompare(b.key));
  }, [flags]);

  const filteredFlags = useMemo(() => {
    return flagList.filter((f) => {
      const matchesSearch = f.key
        .toLowerCase()
        .includes(search.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (filter === "enabled") return f.enabled;
      if (filter === "disabled") return !f.enabled;
      if (filter === "rollout") {
        return (
          f.enabled &&
          typeof f.rollout_percentage === "number" &&
          f.rollout_percentage < 100
        );
      }
      return true;
    });
  }, [flagList, search, filter]);

  const enabledCount = useMemo(
    () => flagList.filter((f) => f.enabled).length,
    [flagList],
  );

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    const currentRollout =
      localRollouts[key] !== undefined
        ? localRollouts[key]
        : (flags[key]?.rollout_percentage ?? 100);

    setMutatingKey(key);
    try {
      await updateFlag(key, nextEnabled, currentRollout);
      onLog?.(
        `FEATURE_FLAG :: [${key}] -> ${nextEnabled ? "ENABLED" : "DISABLED"} (${currentRollout}%)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog?.(`ERR :: Cập nhật flag [${key}] thất bại: ${msg}`);
    } finally {
      setMutatingKey(null);
    }
  };

  const handleRolloutChange = (key: string, value: number) => {
    setLocalRollouts((prev) => ({ ...prev, [key]: value }));
  };

  const handleRolloutCommit = async (key: string, value: number) => {
    const isEnabled = flags[key]?.enabled ?? true;
    setMutatingKey(key);
    try {
      await updateFlag(key, isEnabled, value);
      onLog?.(`FEATURE_FLAG :: [${key}] rollout -> ${value}%`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog?.(`ERR :: Cập nhật rollout [${key}] thất bại: ${msg}`);
    } finally {
      setMutatingKey(null);
    }
  };

  const handleEnableAll = async () => {
    setMutatingKey("ALL");
    try {
      await setAllFlags(true);
      onLog?.("FEATURE_FLAG :: Đã bật tất cả cờ tính năng");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog?.(`ERR :: Bật tất cả thất bại: ${msg}`);
    } finally {
      setMutatingKey(null);
    }
  };

  const handleDisableAll = async () => {
    setMutatingKey("ALL");
    try {
      await setAllFlags(false);
      onLog?.("FEATURE_FLAG :: Đã tắt tất cả cờ tính năng");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog?.(`ERR :: Tắt tất cả thất bại: ${msg}`);
    } finally {
      setMutatingKey(null);
    }
  };

  return (
    <Panel accent={purple} className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-500/20">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: `${purple}22`,
              border: `1px solid ${purple}44`,
            }}
          >
            <Sliders size={16} style={{ color: purple }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-foreground font-mono">
                {"QUẢN LÝ FEATURE FLAGS & ROLLOUT (KI-16)"}
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                style={{
                  background: `${green}18`,
                  color: green,
                  border: `1px solid ${green}44`,
                }}
              >
                {`${enabledCount}/${flagList.length} ACTIVE`}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kiểm soát phân đoạn người dùng và mở khóa tính năng/trò chơi tức
              thì.
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <ActionBtn
            label="Bật tất cả"
            accent={green}
            icon={<Check size={12} />}
            onClick={handleEnableAll}
            disabled={mutatingKey !== null}
            loading={mutatingKey === "ALL"}
          />
          <ActionBtn
            label="Tắt tất cả"
            accent={red}
            icon={<AlertCircle size={12} />}
            onClick={handleDisableAll}
            disabled={mutatingKey !== null}
          />
          <ActionBtn
            label="Làm mới"
            accent={blue}
            icon={<RotateCcw size={12} />}
            onClick={() => void refreshFlags()}
            disabled={loading}
          />
        </div>
      </div>

      {/* Toolbar: Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div
          className="relative flex-1 w-full flex items-center rounded-lg px-3 py-2"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${purple}22`,
          }}
        >
          <Search size={14} className="text-slate-500 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Tìm kiếm cờ (vd: game_nback, game_schulte)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-slate-500 focus:outline-none font-mono"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
          {(
            [
              { id: "all", label: "Tất cả" },
              { id: "enabled", label: "Đang bật" },
              { id: "disabled", label: "Đang tắt" },
              { id: "rollout", label: "Phân đoạn" },
            ] as const
          ).map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className="px-2.5 py-1 rounded-md text-[11px] font-mono tracking-wider transition-all"
                style={{
                  background: active ? `${purple}33` : "rgba(0,0,0,0.2)",
                  color: active ? purple : "#94A3B8",
                  border: `1px solid ${active ? `${purple}66` : "transparent"}`,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flags List / Grid */}
      {loading && flagList.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2 font-mono text-xs">
          <Loader2 size={16} className="animate-spin text-purple-400" />
          Đang tải danh sách feature flags...
        </div>
      ) : error ? (
        <div
          className="p-4 rounded-lg text-xs font-mono"
          style={{
            background: `${red}15`,
            border: `1px solid ${red}33`,
            color: red,
          }}
        >
          Lỗi: {error}
        </div>
      ) : filteredFlags.length === 0 ? (
        <div className="text-center py-10 text-slate-500 font-mono text-xs">
          Không tìm thấy feature flag nào phù hợp bộ lọc.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
          {filteredFlags.map((flag) => {
            const isMutating = mutatingKey === flag.key;
            const currentRollout =
              localRollouts[flag.key] !== undefined
                ? localRollouts[flag.key]
                : (flag.rollout_percentage ?? 100);

            const isGameFlag = flag.key.startsWith("game_");
            const category = isGameFlag ? "Game" : "Feature";

            return (
              <div
                key={flag.key}
                className="p-3.5 rounded-xl transition-all space-y-3"
                style={{
                  background: flag.enabled
                    ? "rgba(16, 24, 40, 0.65)"
                    : "rgba(10, 14, 22, 0.4)",
                  border: `1px solid ${
                    flag.enabled ? `${purple}33` : "rgba(255,255,255,0.05)"
                  }`,
                }}
              >
                {/* Flag Header & Toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold"
                        style={{
                          background: isGameFlag ? `${blue}22` : `${amber}22`,
                          color: isGameFlag ? blue : amber,
                          border: `1px solid ${isGameFlag ? `${blue}44` : `${amber}44`}`,
                        }}
                      >
                        {category}
                      </span>
                      <span className="font-mono text-xs font-bold text-foreground truncate">
                        {flag.key}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {flag.enabled ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Check size={11} /> Kích hoạt ({currentRollout}%
                          Rollout)
                        </span>
                      ) : (
                        <span className="text-slate-500">Đã vô hiệu hóa</span>
                      )}
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(flag.key, flag.enabled)}
                    disabled={isMutating}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50"
                    style={{
                      background: flag.enabled
                        ? green
                        : "rgba(255,255,255,0.15)",
                    }}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow-lg ring-0 transition duration-200 ease-in-out mt-0.5 ${
                        flag.enabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Rollout percentage slider */}
                {flag.enabled && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Tỷ lệ phân đoạn (Sticky Rollout):</span>
                      <span
                        className="font-bold font-mono px-1.5 py-0.2 rounded"
                        style={{
                          background: `${purple}22`,
                          color: purple,
                        }}
                      >
                        {currentRollout}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={currentRollout}
                        disabled={isMutating}
                        onChange={(e) =>
                          handleRolloutChange(flag.key, Number(e.target.value))
                        }
                        onMouseUp={(e) =>
                          handleRolloutCommit(
                            flag.key,
                            Number((e.target as HTMLInputElement).value),
                          )
                        }
                        onTouchEnd={(e) =>
                          handleRolloutCommit(
                            flag.key,
                            Number((e.target as HTMLInputElement).value),
                          )
                        }
                        className="w-full accent-purple-400 cursor-pointer h-1.5 rounded-lg bg-slate-800"
                      />

                      {/* Quick preset chips */}
                      <div className="flex items-center gap-1 shrink-0">
                        {[25, 50, 100].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              handleRolloutChange(flag.key, pct);
                              void handleRolloutCommit(flag.key, pct);
                            }}
                            className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
