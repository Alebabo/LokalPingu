export const lovable = {
  auth: {
    signInWithOAuth: async (..._args: any[]) => ({ error: new Error("Offline mode") }),
  },
};
