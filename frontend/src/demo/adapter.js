// Plugs the demo server into axios: every request the app makes is answered
// here instead of going over the network.

import axios, { AxiosError } from "axios";
import { handleDemoRequest, HttpError } from "./server";

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const pathOf = (url = "") => {
  const clean = String(url).split("?")[0];
  const at = clean.indexOf("/api/");
  const path = at >= 0 ? clean.slice(at + 4) : clean;
  return path.startsWith("/") ? path : `/${path}`;
};

const queryOf = (url = "", params = {}) => {
  const out = {};
  const [, search] = String(url).split("?");
  if (search) {
    new URLSearchParams(search).forEach((v, k) => {
      out[k] = out[k] === undefined ? v : [].concat(out[k], v);
    });
  }
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  });
  return out;
};

const bodyOf = (data) => {
  if (!data) return {};
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (_) {
      return {};
    }
  }
  if (typeof FormData !== "undefined" && data instanceof FormData) return {};
  return data;
};

const demoAdapter = async (config) => {
  await sleep(40 + Math.round(Math.random() * 70));
  const respond = (status, data) => ({
    data,
    status,
    statusText: status < 400 ? "OK" : "Error",
    headers: {},
    config,
    request: {},
  });

  try {
    const data = handleDemoRequest({
      method: config.method,
      path: pathOf(config.url),
      query: queryOf(config.url, config.params),
      body: bodyOf(config.data),
    });
    return respond(200, JSON.parse(JSON.stringify(data === undefined ? {} : data)));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const detail = err instanceof HttpError ? err.detail : "The demo could not answer that request";
    if (!(err instanceof HttpError)) {
      // eslint-disable-next-line no-console
      console.error("[demo]", err);
    }
    throw new AxiosError(detail, status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST", config, {}, respond(status, { detail }));
  }
};

export const installDemoAdapter = () => {
  axios.defaults.adapter = demoAdapter;
  // A real sign-in saved in this browser must never be sent anywhere from the demo.
  delete axios.defaults.headers.common.Authorization;
};
