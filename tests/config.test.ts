import assert from "node:assert/strict";
import type { ConfigStorage, GroupConfig } from "../src/config/store";
import { getGroupConfig, setGroupConfig } from "../src/config/store";

type MemoryStore = Record<string, GroupConfig>;

function createMemoryStorage(): ConfigStorage {
  const store: MemoryStore = {};
  return {
    async read(key: string): Promise<GroupConfig | undefined> {
      return store[key];
    },
    async write(key: string, data: GroupConfig): Promise<void> {
      store[key] = data;
    }
  };
}

async function run(): Promise<void> {
  const storage = createMemoryStorage();
  const chatId = 12345;

  const initial = await getGroupConfig(storage, chatId);
  assert.equal(initial.deleteServiceMessages, false, "Default deleteServiceMessages should be false");

  const updated = await setGroupConfig(storage, chatId, { deleteServiceMessages: true });
  assert.equal(updated.deleteServiceMessages, true, "deleteServiceMessages should be updated");

  const fetched = await getGroupConfig(storage, chatId);
  assert.equal(fetched.deleteServiceMessages, true, "deleteServiceMessages should persist");

  console.log("config tests passed");
}

void run();
