// Sảnh / loại game / bàn từ API (GET /lobbies, /categories, /streams). Chỉ đọc; tạo mới nằm ở luồng ingestion.
import { apiGet } from "./client";

export type Lobby = { id: string; name: string; initial: string; categoryCount: number; streamCount: number };
export type Category = { id: string; lobbyId: string; lobbyName: string; name: string; streamCount: number };
export type Stream = {
  id: string; categoryId: string; categoryName: string; lobbyId: string; lobbyName: string;
  name: string; streamerId: string | null;
};

type Page<T> = { items: T[]; total: number; page: number; limit: number };
type ApiLobby = { lobby_id: string; lobby_name: string; category_count: number; stream_count: number };
type ApiCategory = { category_id: string; category_name: string; lobby_id: string; lobby_name: string; stream_count: number };
type ApiStream = {
  stream_id: string; stream_name: string; category_id: string; category_name: string;
  lobby_id: string; lobby_name: string; streamer_id: string | null;
};

const PAGE_SIZE = 100; // tối đa API cho phép
const MAX_PAGES = 20;  // chặn vòng lặp nếu total bất thường

const toLobby = (l: ApiLobby): Lobby => ({
  id: l.lobby_id,
  name: l.lobby_name,
  initial: Array.from(l.lobby_name)[0]?.toUpperCase() ?? "?",
  categoryCount: l.category_count,
  streamCount: l.stream_count,
});

const toCategory = (c: ApiCategory): Category => ({
  id: c.category_id, lobbyId: c.lobby_id, lobbyName: c.lobby_name, name: c.category_name, streamCount: c.stream_count,
});

const toStream = (s: ApiStream): Stream => ({
  id: s.stream_id, categoryId: s.category_id, categoryName: s.category_name,
  lobbyId: s.lobby_id, lobbyName: s.lobby_name, name: s.stream_name, streamerId: s.streamer_id,
});

/** Lấy hết các trang (mỗi trang tối đa 100 bản ghi). */
async function fetchAll<A, T>(path: string, params: Record<string, string>, map: (a: A) => T): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiGet<Page<A>>(path, { ...params, page, limit: PAGE_SIZE });
    items.push(...res.items.map(map));
    if (res.items.length === 0 || items.length >= res.total) break;
  }
  return items;
}

export const listLobbies = (): Promise<Lobby[]> => fetchAll("/lobbies", {}, toLobby);

export const listCategories = (lobbyId: string): Promise<Category[]> =>
  fetchAll("/categories", { lobby_id: lobbyId }, toCategory);

export const listStreams = (categoryId: string): Promise<Stream[]> =>
  fetchAll("/streams", { category_id: categoryId }, toStream);

export const getCategory = async (id: string): Promise<Category> =>
  toCategory(await apiGet<ApiCategory>(`/categories/${encodeURIComponent(id)}`));

export const getStream = async (id: string): Promise<Stream> =>
  toStream(await apiGet<ApiStream>(`/streams/${encodeURIComponent(id)}`));
