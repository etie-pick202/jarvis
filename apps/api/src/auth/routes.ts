import { loginInput, role, roles } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, parseJson } from "../http.js";
import { bearerToken, requireAuth, requirePermission } from "./middleware.js";
import { createUser, login, logout, switchRole } from "./service.js";

const createUserInput = z.object({
  username: z.string().trim().min(2).max(64),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
  roles,
});

export const authRoutes = new Hono<AppEnv>()
  .post("/login", async (c) => {
    const input = await parseJson(c, loginInput);
    return c.json(await login(c.get("deps"), input.username, input.password));
  })
  .post("/logout", requireAuth, async (c) => {
    const token = bearerToken(c.req.header("Authorization"));
    if (token) await logout(c.get("deps"), token);
    return c.body(null, 204);
  })
  .get("/me", requireAuth, (c) => c.json(c.get("user")))
  .post("/switch-role", requireAuth, async (c) => {
    const { role: target } = await parseJson(c, z.object({ role }));
    const token = bearerToken(c.req.header("Authorization")) ?? "";
    return c.json(await switchRole(c.get("deps"), token, c.get("user"), target));
  })
  .post("/users", requireAuth, requirePermission("user.manage"), async (c) => {
    const input = await parseJson(c, createUserInput);
    return c.json(await createUser(c.get("deps"), input), 201);
  });
