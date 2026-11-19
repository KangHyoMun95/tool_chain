// Giải challenge ALTCHA ngầm (không widget). Trả payload base64 để gửi kèm form đăng ký, hoặc null nếu không giải được.

export type AltchaChallenge = {
  algorithm: "SHA-1" | "SHA-256" | "SHA-512";
  challenge: string;
  maxnumber?: number;
  salt: string;
  signature: string;
};

const SOLVE_TIMEOUT_MS = 60_000;

export function solveAltcha(c: AltchaChallenge): Promise<string | null> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./altcha.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return resolve(null);
    }
    const done = (value: string | null) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), SOLVE_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<{ number: number | null }>) => {
      const n = e.data.number;
      if (n === null || n === undefined) return done(null);
      done(btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature })));
    };
    worker.onerror = () => done(null);
    worker.postMessage({ challenge: c.challenge, salt: c.salt, algorithm: c.algorithm, maxnumber: c.maxnumber });
  });
}
