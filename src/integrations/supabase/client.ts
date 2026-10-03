const chain: any = {
  select: () => chain,
  order: () => chain,
  maybeSingle: async () => ({ data: null }),
  single: async () => ({ data: null, error: null }),
  insert: () => chain,
};

export const supabase: any = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => chain,
};
