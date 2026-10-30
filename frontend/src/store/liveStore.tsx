import localforage from "localforage";

// Define an Activity interface
export interface Activity {
  id: number | string;
  finance_id?: number;
  type: "customer" | "payment" | "vehicle" | string;
  reference_id?: string;
  description: string;
  amount?: number;
  created_by?: string;
  created_at: string;
}

export const liveStore = {
  db: localforage.createInstance({ name: "finance_app", storeName: "recent_activity" }),

  async getAll(): Promise<Activity[]> {
    const items: Activity[] = [];
    await liveStore.db.iterate<Activity, void>((value) => {
      if (value) items.push(value);
    });
    return items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  async add(activity: Activity): Promise<void> {
    await liveStore.db.setItem(String(activity.id), activity);
  },

  async clear(): Promise<void> {
    await liveStore.db.clear();
  },
};
