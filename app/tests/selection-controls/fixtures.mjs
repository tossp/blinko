export function createFixtures() {
  const provider = {
    id: 1,
    title: "Fixture provider",
    provider: "openai",
    config: {},
    models: [],
  };
  const models = [1, 2].map((id) => ({
    id,
    title: `Fixture model ${id}`,
    modelKey: `fixture-${id}`,
    providerId: 1,
    provider,
    capabilities: {
      inference: true,
      embedding: true,
      audio: true,
      image: true,
    },
  }));
  const state = { calls: [], unexpected: [], config: {} };
  const reset = () => {
    state.calls.length = 0;
    state.unexpected.length = 0;
    state.config = {
      mainModelId: 1,
      embeddingModelId: 1,
      voiceModelId: 1,
      imageModelId: 1,
      isUseAiPostProcessing: true,
      aiPostProcessingMode: "comment",
    };
  };
  reset();
  const middleware = async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = new URL(req.originalUrl || req.url, "http://localhost");
    const inputs = JSON.parse(body || url.searchParams.get("input") || "{}");
    const names = url.pathname.split("/").at(-1).split(",");
    const responses = names.map((name, index) => {
      const input = url.searchParams.has("batch")
        ? inputs[index]?.json
        : inputs.json;
      state.calls.push({ name, input });
      let json;
      switch (name) {
        case "config.list":
          json = { ...state.config };
          break;
        case "config.update":
          state.config[input.key] = input.value;
          json = true;
          break;
        case "ai.getAllProviders":
          json = [provider];
          break;
        case "ai.getAllModels":
          json = models;
          break;
        case "tags.list":
          json = [{ id: 7, name: "Tag seven", parent: 0, icon: null }];
          break;
        case "notes.list":
        case "analytics.dailyNoteCount":
          json = [];
          break;
        case "analytics.monthlyStats":
          json = {
            noteCount: 0,
            totalWords: 0,
            maxDailyWords: 0,
            activeDays: 0,
            tagStats: [],
          };
          break;
        default:
          state.unexpected.push(name);
          json = null;
      }
      return { result: { data: { json } } };
    });
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(url.searchParams.has("batch") ? responses : responses[0]),
    );
  };
  return { state, reset, middleware };
}
