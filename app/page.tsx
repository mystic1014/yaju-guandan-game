"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  chooseAiMove,
  classifyHand,
  createMatch,
  getLegalMoves,
  observeForAi,
  passTurn,
  playCards,
  resolveTribute,
  restoreGame,
  serializeGame,
  sortHand,
  startNextRound,
  type Card,
  type Difficulty,
  type MatchState,
  type PlayerState,
} from "./game-engine";

const SAVE_KEY = "guandan-save-v1";
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  casual: "休闲",
  standard: "标准",
  expert: "高手",
};

function playTone(enabled: boolean, frequency = 520) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  } catch {
    // Audio is a progressive enhancement.
  }
}

function CardFace({
  card,
  selected,
  onClick,
  compact = false,
}: {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const red = card.suit === "♥" || card.suit === "♦" || card.rank === "BJ";
  const joker = card.rank === "SJ" || card.rank === "BJ";
  return (
    <button
      type="button"
      className={`playing-card ${compact ? "compact" : ""} ${selected ? "selected" : ""} ${red ? "red" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={joker ? (card.rank === "BJ" ? "大王" : "小王") : `${card.suit}${card.rank}`}
      tabIndex={onClick ? 0 : -1}
    >
      {joker ? (
        <span className="joker-text">{card.rank === "BJ" ? "大王" : "小王"}</span>
      ) : (
        <>
          <span className="card-rank">{card.rank}</span>
          <span className="card-suit">{card.suit}</span>
        </>
      )}
    </button>
  );
}

function PlayerPanel({
  player,
  active,
  seconds,
}: {
  player: PlayerState;
  active: boolean;
  seconds: number;
}) {
  const teamLabel = player.team === 0 ? "我方" : "对方";
  const initials = player.name.slice(0, 1);
  return (
    <section
      className={`player-panel seat-${player.seat} team-${player.team} ${active ? "active" : ""}`}
      aria-label={`${player.name}，${teamLabel}，剩余${player.hand.length}张`}
    >
      <div className="avatar" aria-hidden="true">{initials}</div>
      <div className="player-copy">
        <div className="player-name-row">
          <strong>{player.name}</strong>
          <span className={`team-tag team-tag-${player.team}`}>{teamLabel}</span>
        </div>
        <div className="player-meta">
          <span className="online-dot" /> 在线
          <span>Lv.{46 + player.id}</span>
          {player.autoPlay && <span>托管中</span>}
        </div>
        <div className="card-count">剩余 <b>{player.hand.length}</b> 张</div>
      </div>
      {player.seat !== "bottom" && (
        <div className="card-backs" aria-hidden="true">
          {Array.from({ length: Math.min(9, Math.max(2, Math.ceil(player.hand.length / 3))) }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      )}
      <div className={`countdown ${active ? "running" : ""}`}>
        <span>{active ? seconds : "—"}</span>
      </div>
    </section>
  );
}

function StartScreen({
  difficulty,
  setDifficulty,
  canContinue,
  onNew,
  onContinue,
  onRules,
}: {
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
  canContinue: boolean;
  onNew: () => void;
  onContinue: () => void;
  onRules: () => void;
}) {
  return (
    <main className="welcome-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="welcome-card">
        <div className="brand-mark" aria-hidden="true">掼</div>
        <p className="eyebrow">双副牌 · 四人结对 · 对家同队</p>
        <h1>雅局 · 掼蛋</h1>
        <p className="welcome-subtitle">
          从 2 打到 A 的完整竞技对局。你的搭档坐在正对面，与三名遵守公开信息的 AI 同桌切磋。
        </p>
        <div className="difficulty-picker" aria-label="选择AI难度">
          {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setDifficulty(item)}
              className={difficulty === item ? "selected" : ""}
            >
              <strong>{DIFFICULTY_LABEL[item]}</strong>
              <span>{item === "casual" ? "轻松出牌" : item === "standard" ? "记牌配合" : "残局推演"}</span>
            </button>
          ))}
        </div>
        <div className="welcome-actions">
          <button className="primary-action" type="button" onClick={onNew}>开始新比赛</button>
          <button className="secondary-action" type="button" onClick={onContinue} disabled={!canContinue}>
            继续上次牌局
          </button>
        </div>
        <button className="text-action" type="button" onClick={onRules}>查看竞技规则</button>
      </section>
      <div className="welcome-features" aria-label="游戏特性">
        <span>两副牌 108 张</span><span>逢人配</span><span>进贡与抗贡</span><span>本机自动存档</span>
      </div>
    </main>
  );
}

export default function Home() {
  const [match, setMatch] = useState<MatchState | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [modal, setModal] = useState<"rules" | "settings" | "pause" | null>(null);
  const [drawer, setDrawer] = useState<"history" | "score" | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [seconds, setSeconds] = useState(18);
  const currentPlayerId = match?.round.currentPlayer;
  const currentPhase = match?.round.phase;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = window.localStorage.getItem(SAVE_KEY);
      setHasSave(Boolean(saved && restoreGame(saved)));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!match) return;
    window.localStorage.setItem(SAVE_KEY, serializeGame(match));
  }, [match]);

  useEffect(() => {
    if (currentPhase !== "playing" || modal) return;
    const reset = window.setTimeout(() => setSeconds(18), 0);
    const timer = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(timer);
    };
  }, [currentPlayerId, currentPhase, modal]);

  const runAiTurn = useCallback(() => {
    setMatch((current) => {
      if (!current || current.round.phase !== "playing") return current;
      const player = current.players[current.round.currentPlayer];
      if (player.isHuman && !player.autoPlay) return current;
      const observation = observeForAi(current, player.id);
      const move = chooseAiMove(observation);
      const result = move
        ? playCards(current, player.id, move.map((card) => card.id))
        : passTurn(current, player.id);
      if (result.ok) playTone(current.soundEnabled, move ? 440 : 260);
      return result.state;
    });
  }, []);

  useEffect(() => {
    if (!match || modal || match.round.phase !== "playing") return;
    const player = match.players[match.round.currentPlayer];
    if (player.isHuman && !player.autoPlay) return;
    const timeout = window.setTimeout(runAiTurn, match.animationEnabled ? 650 : 120);
    return () => window.clearTimeout(timeout);
  }, [match, modal, runAiTurn]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!match || modal) return;
      if (event.key === "Escape") setSelected([]);
      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        const human = match.players[0];
        const move = getLegalMoves(human.hand, match.round.lastPlay?.pattern ?? null, match.currentLevel)[0];
        if (move) setSelected(move.map((card) => card.id));
      }
      if (event.key === "Enter" && selected.length) {
        event.preventDefault();
        const result = playCards(match, 0, selected);
        if (result.ok) {
          setMatch(result.state);
          setSelected([]);
          setFeedback("");
        } else setFeedback(result.error ?? "无法出牌");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [match, modal, selected]);

  const startNew = () => {
    setMatch(createMatch(Date.now(), difficulty));
    setHasSave(true);
    setSelected([]);
    setFeedback("");
  };

  const continueSaved = () => {
    const saved = window.localStorage.getItem(SAVE_KEY);
    const restored = saved ? restoreGame(saved) : null;
    if (restored) {
      setMatch(restored);
      setDifficulty(restored.difficulty);
      setFeedback("牌局已恢复");
    }
  };

  const toggleCard = (id: string) => {
    if (!match || match.round.currentPlayer !== 0 || match.round.phase !== "playing") return;
    setSelected((current) => current.includes(id) ? current.filter((cardId) => cardId !== id) : [...current, id]);
    setFeedback("");
  };

  const submitPlay = () => {
    if (!match) return;
    const result = playCards(match, 0, selected);
    if (!result.ok) {
      setFeedback(result.error ?? "无法出牌");
      return;
    }
    playTone(match.soundEnabled, 620);
    setMatch(result.state);
    setSelected([]);
    setFeedback("");
  };

  const submitPass = () => {
    if (!match) return;
    const result = passTurn(match, 0);
    if (!result.ok) {
      setFeedback(result.error ?? "现在不能不要");
      return;
    }
    playTone(match.soundEnabled, 260);
    setMatch(result.state);
    setSelected([]);
    setFeedback("");
  };

  const hint = () => {
    if (!match) return;
    const move = getLegalMoves(match.players[0].hand, match.round.lastPlay?.pattern ?? null, match.currentLevel)[0];
    if (move) {
      setSelected(move.map((card) => card.id));
      setFeedback(`提示：${classifyHand(move, match.currentLevel)?.label ?? "可出牌"}`);
    } else setFeedback("当前没有能压过上一手的牌，可以选择不要");
  };

  const selectedPattern = useMemo(() => {
    if (!match || !selected.length) return null;
    const cards = match.players[0].hand.filter((card) => selected.includes(card.id));
    return classifyHand(cards, match.currentLevel);
  }, [match, selected]);

  if (!match) {
    return (
      <>
        <StartScreen
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          canContinue={hasSave}
          onNew={startNew}
          onContinue={continueSaved}
          onRules={() => setModal("rules")}
        />
        {modal === "rules" && <RulesModal onClose={() => setModal(null)} />}
      </>
    );
  }

  const human = match.players[0];
  const isHumanTurn = match.round.phase === "playing" && match.round.currentPlayer === 0;
  const teamCounts = [0, 1].map((team) =>
    match.players.filter((player) => player.team === team).reduce((total, player) => total + player.hand.length, 0),
  );
  const lastCards = match.round.lastPlay?.cards ?? [];
  const finishNames = match.round.finishOrder.map((id) => match.players[id].name);

  return (
    <main className={`game-shell ${match.animationEnabled ? "motion-on" : "motion-off"}`}>
      <header className="topbar">
        <div className="game-logo"><span>掼</span><strong>雅局掼蛋</strong></div>
        <div className="top-stat"><span>房间</span><b>6288</b></div>
        <div className="top-stat"><span>本局级牌</span><b>{match.currentLevel}</b></div>
        <div className="top-stat"><span>当前</span><b>第 {match.roundNumber} 局</b></div>
        <div className="top-stat"><span>级数</span><b>我方 {match.teamLevels[0]} · 对方 {match.teamLevels[1]}</b></div>
        <div className="rule-badge">双副牌 · 108张</div>
        <div className="top-actions">
          <span className="network"><i /> 网络良好</span>
          <button type="button" aria-label="音效" onClick={() => setMatch({ ...match, soundEnabled: !match.soundEnabled })}>
            {match.soundEnabled ? "音" : "静"}
          </button>
          <button type="button" aria-label="设置" onClick={() => setModal("settings")}>设</button>
          <button type="button" aria-label="暂停" onClick={() => setModal("pause")}>停</button>
        </div>
      </header>

      <aside className="left-tools" aria-label="社交工具">
        <button type="button" disabled title="单人版暂不提供在线聊天"><span>◇</span>聊天</button>
        <button type="button" onClick={() => setFeedback("🙂 发送了一个微笑表情")}><span>☺</span>表情</button>
        <button type="button" onClick={() => setFeedback("语音功能仅在在线版开放")}><span>●</span>语音</button>
      </aside>

      <aside className="right-tools" aria-label="牌局工具">
        <button type="button" onClick={() => setDrawer(drawer === "history" ? null : "history")}><span>▤</span>记录</button>
        <button type="button" onClick={() => setDrawer(drawer === "score" ? null : "score")}><span>▥</span>战绩</button>
        <button type="button" disabled title="单人版不提供在线排行"><span>♜</span>排行</button>
        <button type="button" onClick={() => setModal("rules")}><span>?</span>规则</button>
      </aside>

      {drawer && (
        <section className="info-drawer" aria-live="polite">
          <button className="drawer-close" type="button" onClick={() => setDrawer(null)}>×</button>
          {drawer === "history" ? (
            <>
              <h2>出牌记录</h2>
              <div className="history-list">
                {match.round.history.length === 0 && <p>本局还没有出牌记录。</p>}
                {[...match.round.history].reverse().slice(0, 12).map((entry, index) => (
                  <div key={`${entry.turn}-${index}`}><span>{match.players[entry.playerId].name}</span><b>{entry.pattern.label}</b></div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2>升级战绩</h2>
              <div className="score-big"><span>我方</span><b>{match.teamLevels[0]}</b></div>
              <div className="score-big opponent"><span>对方</span><b>{match.teamLevels[1]}</b></div>
              <p>先成功过 A 的队伍赢得整场比赛。</p>
            </>
          )}
        </section>
      )}

      <section className="table-wrap" aria-label="掼蛋牌桌">
        <div className="wood-rim">
          <div className="felt-table">
            {match.players.map((player) => (
              <PlayerPanel key={player.id} player={player} active={match.round.currentPlayer === player.id && match.round.phase === "playing"} seconds={seconds} />
            ))}

            <section className="center-play" aria-live="polite">
              <span className="round-kicker">本轮出牌 · 第 {Math.max(1, match.round.turn)} 手</span>
              <h2>{match.round.statusMessage}</h2>
              <div className="last-play-cards">
                {lastCards.length ? lastCards.map((card) => <CardFace key={card.id} card={card} compact />) : <div className="lead-placeholder">等待领出</div>}
              </div>
              {match.round.lastPlay && (
                <p className="last-play-label">
                  {match.players[match.round.lastPlay.playerId].name} · {match.round.lastPlay.pattern.label}
                </p>
              )}
              <div className="remaining-score"><span>我方 <b>{teamCounts[0]}</b></span><i /><span>对方 <b>{teamCounts[1]}</b></span></div>
            </section>
          </div>
        </div>
      </section>

      <section className="hand-area" aria-label="我的手牌">
        <div className="hand-summary">
          <span>我的手牌</span><b>{human.hand.length} 张</b>
          {selectedPattern && <em>{selectedPattern.label}</em>}
        </div>
        <div className="hand-cards">
          {human.hand.map((card) => (
            <CardFace key={card.id} card={card} selected={selected.includes(card.id)} onClick={() => toggleCard(card.id)} />
          ))}
        </div>
      </section>

      <footer className="action-bar">
        <button className="play-button" type="button" onClick={submitPlay} disabled={!isHumanTurn || selected.length === 0}>出牌</button>
        <button type="button" onClick={submitPass} disabled={!isHumanTurn || !match.round.lastPlay}>不要</button>
        <button type="button" onClick={hint} disabled={!isHumanTurn}>提示</button>
        <button type="button" onClick={() => setMatch({ ...match, players: match.players.map((player) => player.id === 0 ? { ...player, hand: sortHand(player.hand, match.currentLevel) } : player) })}>排序</button>
        <button type="button" onClick={() => setSelected([])} disabled={!selected.length}>撤销选择</button>
        <button type="button" onClick={() => setMatch({ ...match, players: match.players.map((player) => player.id === 0 ? { ...player, autoPlay: !player.autoPlay } : player) })}>{human.autoPlay ? "取消托管" : "自动托管"}</button>
        <button type="button" onClick={() => setModal("settings")}>设置</button>
        <div className={`feedback ${feedback ? "show" : ""}`} role="status">{feedback || "快捷键：H 提示 · Enter 出牌 · Esc 撤销"}</div>
      </footer>

      {match.round.phase === "tribute" && match.round.tribute && (
        <div className="modal-backdrop">
          <section className="dialog tribute-dialog" role="dialog" aria-modal="true" aria-labelledby="tribute-title">
            <span className="dialog-icon">礼</span>
            <p className="eyebrow">新一副牌 · 贡还牌阶段</p>
            <h2 id="tribute-title">{match.round.tribute.summary}</h2>
            <p>{match.round.tribute.anti ? "本轮免除进贡，由上副头游率先领出。" : "系统将按牌点完成进贡，并以不超过 10 的牌完成还牌。"}</p>
            <button className="primary-action" type="button" onClick={() => setMatch(resolveTribute(match).state)}>确认并继续</button>
          </section>
        </div>
      )}

      {(match.round.phase === "roundEnd" || match.round.phase === "matchEnd") && (
        <div className="modal-backdrop">
          <section className="dialog result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <span className="dialog-icon">胜</span>
            <p className="eyebrow">{match.round.phase === "matchEnd" ? "整场比赛结束" : `第 ${match.roundNumber} 局结束`}</p>
            <h2 id="result-title">{match.round.statusMessage}</h2>
            <ol>{finishNames.map((name, index) => <li key={name}><span>第 {index + 1} 名</span><b>{name}</b></li>)}</ol>
            <div className="result-levels"><span>我方级牌 <b>{match.teamLevels[0]}</b></span><span>对方级牌 <b>{match.teamLevels[1]}</b></span></div>
            {match.round.phase === "roundEnd" ? (
              <button className="primary-action" type="button" onClick={() => setMatch(startNextRound(match).state)}>进入下一局</button>
            ) : (
              <button className="primary-action" type="button" onClick={startNew}>再来一场</button>
            )}
          </section>
        </div>
      )}

      {modal === "rules" && <RulesModal onClose={() => setModal(null)} />}
      {(modal === "settings" || modal === "pause") && (
        <div className="modal-backdrop">
          <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <p className="eyebrow">{modal === "pause" ? "牌局已暂停" : "偏好设置"}</p>
            <h2 id="settings-title">沉浸体验</h2>
            <label><span>操作音效</span><input type="checkbox" checked={match.soundEnabled} onChange={(event) => setMatch({ ...match, soundEnabled: event.target.checked })} /></label>
            <label><span>牌面动画</span><input type="checkbox" checked={match.animationEnabled} onChange={(event) => setMatch({ ...match, animationEnabled: event.target.checked })} /></label>
            <label><span>AI 难度</span><b>{DIFFICULTY_LABEL[match.difficulty]}</b></label>
            <div className="dialog-actions">
              <button className="secondary-action" type="button" onClick={() => { setMatch(null); setModal(null); }}>返回首页</button>
              <button className="primary-action" type="button" onClick={() => setModal(null)}>继续游戏</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section className="dialog rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭规则">×</button>
        <p className="eyebrow">2022 竞技掼蛋规则</p>
        <h2 id="rules-title">快速规则</h2>
        <div className="rules-grid">
          <article><b>四人结对</b><p>上下是一队，左右是一队；使用两副牌共 108 张，每人 27 张。</p></article>
          <article><b>逢人配</b><p>红桃级牌可作为除大小王外的任意牌，与自然牌组合成合法牌型。</p></article>
          <article><b>牌型比较</b><p>普通牌型同类比较；炸弹压普通牌，六张及以上炸弹高于同花顺，四王炸最大。</p></article>
          <article><b>升级</b><p>双下升 3 级、头游搭档三游升 2 级、搭档末游升 1 级，成功过 A 赢得比赛。</p></article>
          <article><b>借风</b><p>玩家出完最后一手后无人压牌，由其仍在牌局中的队友领出下一轮。</p></article>
          <article><b>贡还牌</b><p>末游向头游进贡最大牌；双下双方进贡。抓到两张大王可抗贡。</p></article>
        </div>
        <button className="primary-action" type="button" onClick={onClose}>我知道了</button>
      </section>
    </div>
  );
}
