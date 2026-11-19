// Web Worker giải challenge ALTCHA (brute-force SHA-256) để không làm đơ trang. Dùng đúng solveChallenge của altcha-lib
// (cùng phiên bản với API) nên khớp thuật toán của verifySolution.
import { solveChallenge } from "altcha-lib/v1";

type Job = { challenge: string; salt: string; algorithm: "SHA-1" | "SHA-256" | "SHA-512"; maxnumber?: number };

self.onmessage = async (e: MessageEvent<Job>) => {
  const { challenge, salt, algorithm, maxnumber } = e.data;
  try {
    const { promise } = solveChallenge(challenge, salt, algorithm, maxnumber ?? 1_000_000);
    const solution = await promise;
    self.postMessage({ number: solution ? solution.number : null });
  } catch {
    self.postMessage({ number: null });
  }
};
