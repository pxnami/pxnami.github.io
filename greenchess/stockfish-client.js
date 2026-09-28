class StockfishClient {
  constructor() {
    this.worker = new Worker("engine/stockfish.js");
    this.ready = false;
    this.readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
    this.pending = null;

    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.postMessage("uci");
  }

  _onMessage(line) {
    if (typeof line !== "string") return;

    if (line === "uciok") {
      this.worker.postMessage("isready");
      return;
    }

    if (line === "readyok") {
      this.ready = true;
      this._resolveReady();
      return;
    }

    if (!this.pending) return;

    if (line.startsWith("info")) {
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      const pvMatch = line.match(/ pv (.+)$/);
      const depthMatch = line.match(/depth (\d+)/);
      if (scoreMatch) {
        this.pending.lastScore = {
          type: scoreMatch[1],
          value: parseInt(scoreMatch[2], 10),
        };
      }
      if (pvMatch) {
        this.pending.lastPv = pvMatch[1].trim().split(/\s+/);
      }
      if (depthMatch) {
        this.pending.lastDepth = parseInt(depthMatch[1], 10);
      }
    } else if (line.startsWith("bestmove")) {
      const parts = line.split(/\s+/);
      const bestMove = parts[1];
      const result = {
        bestMove: bestMove === "(none)" ? null : bestMove,
        score: this.pending.lastScore || null,
        pv: this.pending.lastPv || [],
        depth: this.pending.lastDepth || 0,
      };
      const resolve = this.pending.resolve;
      this.pending = null;
      resolve(result);
    }
  }

  async waitReady() {
    return this.readyPromise;
  }

  // Analyze a FEN string to the given depth. Returns
  // { bestMove, score: {type: 'cp'|'mate', value}, pv, depth }.
  // The score is always from the perspective of the side to move in the FEN.
  analyze(fen, depth) {
    return new Promise((resolve) => {
      const start = () => {
        this.pending = { resolve, lastScore: null, lastPv: [], lastDepth: 0 };
        this.worker.postMessage("ucinewgame");
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth || 14}`);
      };
      if (this.ready) start();
      else this.readyPromise.then(start);
    });
  }

  destroy() {
    this.worker.postMessage("quit");
    this.worker.terminate();
  }
}
