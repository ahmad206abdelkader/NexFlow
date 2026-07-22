import ky from "ky";

export const workflowHttpClient = ky.create({
  redirect: "error",
  retry: {
    limit: 2,
    methods: ["get", "head"],
  },
  timeout: 30_000,
});
