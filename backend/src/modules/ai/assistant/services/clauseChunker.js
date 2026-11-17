'use strict';

/**
 * Incremental Streaming Clause Chunker (`clauseChunker.js`).
 *
 * Splits live LLM token streams into natural spoken clauses so clause #1 is sent
 * to TTS within ~180–250ms while Gemini is still generating clause #2!
 *
 * Avoids splitting inside numeric thousands separators (`₹2,45,000`) or decimals (`12.5%`).
 */

class StreamingClauseChunker {
  constructor(options = {}) {
    this.minFirstClauseChars = options.minFirstClauseChars || 18;
    this.minSoftClauseChars = options.minSoftClauseChars || 42;
    this.maxClauseChars = options.maxClauseChars || 180;
    this.buffer = '';
    this.emittedCount = 0;
  }

  /**
   * Feeds a token delta and returns an array of 0+ ready-to-speak clauses.
   * @param {string} delta
   * @returns {string[]}
   */
  push(delta) {
    if (!delta) return [];
    this.buffer += String(delta);
    const out = [];

    for (; ;) {
      const splitIdx = this._findSplitIndex();
      if (splitIdx === -1) break;

      const chunk = this.buffer.slice(0, splitIdx).trim();
      this.buffer = this.buffer.slice(splitIdx).replace(/^\s+/, '');
      if (chunk) {
        out.push(chunk);
        this.emittedCount += 1;
      }
    }

    return out;
  }

  /**
   * Flushes any trailing text at the end of the LLM stream.
   * @returns {string[]}
   */
  flush() {
    const tail = this.buffer.trim();
    this.buffer = '';
    if (!tail) return [];
    this.emittedCount += 1;
    return [tail];
  }

  _findSplitIndex() {
    const buf = this.buffer;
    const len = buf.length;
    const minHard = this.emittedCount === 0 ? this.minFirstClauseChars : 24;

    if (len < minHard) return -1;

    // 1. Prefer hard sentence boundaries (`. `, `? `, `! `, `। `, or `\n`)
    for (let i = minHard - 1; i < len; i += 1) {
      const ch = buf[i];
      const next = i + 1 < len ? buf[i + 1] : '';

      if (ch === '\n') {
        return i + 1;
      }

      if (ch === '?' || ch === '!' || ch === '।') {
        if (!next || /\s/.test(next)) {
          return i + 1;
        }
      }

      if (ch === '.') {
        const prev = i > 0 ? buf[i - 1] : '';
        // Do NOT split on decimal numbers like `12.5` or `Rs.`
        const isDecimal = /\d/.test(prev) && /\d/.test(next);
        const isRsAbbrev = /Rs$/i.test(buf.slice(Math.max(0, i - 2), i));
        if (!isDecimal && !isRsAbbrev && /\s/.test(next)) {
          return i + 1;
        }
      }
    }

    // 2. Soft clause split (`; `, `: `, `, `) when buffer is getting long so first audio stays fast
    if (len >= this.minSoftClauseChars) {
      for (let i = this.minSoftClauseChars - 1; i < len; i += 1) {
        const ch = buf[i];
        const next = i + 1 < len ? buf[i + 1] : '';
        const prev = i > 0 ? buf[i - 1] : '';
        if ((ch === ';' || ch === ':' || ch === ',') && /\s/.test(next) && !/\d/.test(prev)) {
          return i + 1;
        }
      }
    }

    // 3. Hard ceiling split on nearest space if no punctuation appeared
    if (len >= this.maxClauseChars) {
      const spaceIdx = buf.lastIndexOf(' ', this.maxClauseChars);
      if (spaceIdx > minHard) {
        return spaceIdx + 1;
      }
    }

    return -1;
  }
}

module.exports = {
  StreamingClauseChunker,
};

