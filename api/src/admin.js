import AdminJS, { ComponentLoader } from "adminjs";
import AdminJSExpress from "@adminjs/express";
import { Database, Resource, getModelByName } from "@adminjs/prisma";
import { prisma } from "./db.js";
import { verifyPassword } from "./auth.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

AdminJS.registerAdapter({ Database, Resource });

const componentLoader = new ComponentLoader();
const Components = {
  UserRelatedRecords: componentLoader.add(
    "UserRelatedRecords",
    path.join(__dirname, "admin-components/UserRelatedRecords")
  ),
};

export async function setupAdmin() {
  const admin = new AdminJS({
    rootPath: "/admin",
    loginPath: "/admin/login",
    logoutPath: "/admin/logout",
    componentLoader,
    resources: [
      // ── Users: view, ban/unban via edit ──
      {
        resource: { model: getModelByName("User"), client: prisma },
        options: {
          navigation: { name: "Пользователи", icon: "User" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            password_hash: { isVisible: false },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
            // Hide reverse relations
            shouts: { isVisible: false },
            comments: { isVisible: false },
            media: { isVisible: false },
            shoutLikes: { isVisible: false },
            commentLikes: { isVisible: false },
            receivedNotifications: { isVisible: false },
            sentNotifications: { isVisible: false },
            // Virtual property: tabbed related records on show page
            relatedRecords: {
              type: "string",
              isVisible: { show: true, list: false, edit: false, filter: false },
              components: { show: Components.UserRelatedRecords },
              position: 100,
            },
          },
          actions: {
            new: { isAccessible: false },
            delete: { isAccessible: false },
            edit: {
              before: async (request, context) => {
                // On save, snapshot the current is_banned before the update
                if (request.method === "post") {
                  const userId = context.record?.params?.id;
                  if (userId) {
                    const user = await prisma.user.findUnique({
                      where: { id: userId },
                      select: { is_banned: true },
                    });
                    request.params._prevIsBanned = user?.is_banned ?? 0;
                  }
                }
                return request;
              },
              after: async (response, request, context) => {
                if (request.method !== "post") return response;

                const record = response.record;
                if (!record || !record.params) return response;

                const userId = record.params.id;
                const isBanned = Number(record.params.is_banned);
                const prev = Number(request.params._prevIsBanned ?? 0);

                if (prev !== isBanned) {
                  if (isBanned === 1 && prev === 0) {
                    // BANNED: soft-delete all user's active content with marker 2
                    const { count: shouts } = await prisma.shout.updateMany({
                      where: { user_id: userId, is_deleted: 0 },
                      data: { is_deleted: 2 },
                    });
                    const { count: comments } = await prisma.comment.updateMany({
                      where: { user_id: userId, is_deleted: 0 },
                      data: { is_deleted: 2 },
                    });
                    console.log(`[Admin] Banned user ${userId}: hid ${shouts} shouts, ${comments} comments`);
                  } else if (isBanned === 0 && prev === 1) {
                    // UNBANNED: restore only ban-deleted content (is_deleted = 2)
                    const { count: shouts } = await prisma.shout.updateMany({
                      where: { user_id: userId, is_deleted: 2 },
                      data: { is_deleted: 0 },
                    });
                    const { count: comments } = await prisma.comment.updateMany({
                      where: { user_id: userId, is_deleted: 2 },
                      data: { is_deleted: 0 },
                    });
                    console.log(`[Admin] Unbanned user ${userId}: restored ${shouts} shouts, ${comments} comments`);
                  }
                }
                return response;
              },
            },
          },
        },
      },

      // ── Shouts: soft-delete (default), restore, hard-delete ──
      {
        resource: { model: getModelByName("Shout"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            content: { type: "textarea" },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
            // Hide reverse relations to unregistered resources
            likes: { isVisible: false },
            notifications: { isVisible: false },
          },
          actions: {
            // Default delete → soft-delete
            delete: {
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.shout.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 1 },
                });
                await prisma.comment.updateMany({
                  where: { shout_id: record.params.id },
                  data: { is_deleted: 1 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Вопль скрыт (soft-delete)",
                    type: "success",
                  },
                };
              },
            },
            // Restore soft-deleted shout
            restore: {
              actionType: "record",
              label: "Восстановить",
              component: false,
              guard: "Восстановить этот вопль?",
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.shout.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 0 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Вопль восстановлен",
                    type: "success",
                  },
                };
              },
            },
            // Permanent hard-delete
            hardDelete: {
              actionType: "record",
              label: "Удалить навсегда",
              component: false,
              variant: "danger",
              guard:
                "УДАЛИТЬ НАВСЕГДА? Это действие необратимо!",
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                const shoutId = record.params.id;
                // Order matters: comments FK is RESTRICT, so delete children first
                await prisma.comment.deleteMany({
                  where: { shout_id: shoutId },
                });
                await prisma.shout.delete({ where: { id: shoutId } });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Вопль удалён из базы",
                    type: "success",
                  },
                };
              },
            },
          },
        },
      },

      // ── Comments: soft-delete (default), restore, hard-delete ──
      {
        resource: { model: getModelByName("Comment"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            content: { type: "textarea" },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
            // Hide reverse relations to unregistered resources
            likes: { isVisible: false },
            notifications: { isVisible: false },
          },
          actions: {
            delete: {
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.comment.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 1 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Комментарий скрыт (soft-delete)",
                    type: "success",
                  },
                };
              },
            },
            restore: {
              actionType: "record",
              label: "Восстановить",
              component: false,
              guard: "Восстановить этот комментарий?",
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.comment.update({
                  where: { id: record.params.id },
                  data: { is_deleted: 0 },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Комментарий восстановлен",
                    type: "success",
                  },
                };
              },
            },
            hardDelete: {
              actionType: "record",
              label: "Удалить навсегда",
              component: false,
              variant: "danger",
              guard: "УДАЛИТЬ НАВСЕГДА? Это действие необратимо!",
              handler: async (request, response, context) => {
                const { record, resource, h } = context;
                await prisma.comment.delete({
                  where: { id: record.params.id },
                });
                return {
                  record: record.toJSON(context.currentAdmin),
                  redirectUrl: h.resourceUrl({
                    resourceId:
                      resource._decorated?.id() || resource.id(),
                  }),
                  notice: {
                    message: "Комментарий удалён из базы",
                    type: "success",
                  },
                };
              },
            },
          },
        },
      },

      // ── Media: read-only, resolves media_id references from Shouts/Comments ──
      {
        resource: { model: getModelByName("Media"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            id: { isDisabled: true },
            created_at: { isDisabled: true },
          },
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
            delete: { isAccessible: false },
          },
        },
      },

      // ── Announcements: new → auto-soft-deletes previous ──
      {
        resource: { model: getModelByName("Announcement"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
          sort: { sortBy: "created_at", direction: "desc" },
          properties: {
            content: { type: "textarea" },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
          },
          actions: {
            new: {
              before: async (request) => {
                // On POST (actual creation), soft-delete all active announcements first
                if (request.method === "post") {
                  await prisma.announcement.updateMany({
                    where: { is_deleted: 0 },
                    data: { is_deleted: 1 },
                  });
                }
                return request;
              },
            },
          },
        },
      },

      // ── Settings: edit value only, key is read-only ──
      {
        resource: { model: getModelByName("Setting"), client: prisma },
        options: {
          navigation: { name: "Настройки", icon: "Settings" },
          properties: {
            key: { isDisabled: true },
          },
          actions: {
            new: { isAccessible: false },
            delete: { isAccessible: false },
          },
        },
      },

    ],
    branding: {
      companyName: "Вопли — Админ-панель",
      softwareBrothers: false,
    },
  });

  // Force component bundling before the router is created.
  // @adminjs/express fires admin.initialize() without await, and in
  // development mode initialize() is a no-op. We temporarily set
  // NODE_ENV=production so the bundler runs, then restore the original value.
  const origNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  await admin.initialize();
  process.env.NODE_ENV = origNodeEnv;

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
  const ADMIN_COOKIE_SECRET =
    process.env.ADMIN_COOKIE_SECRET || "change-this-admin-cookie-secret";

  const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email, password) => {
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
          console.warn(
            "[Admin] ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set — login disabled"
          );
          return null;
        }
        if (email !== ADMIN_EMAIL) return null;
        const valid = await verifyPassword(password, ADMIN_PASSWORD_HASH);
        if (!valid) return null;
        console.log(`[Admin] Login: ${email}`);
        return { email };
      },
      cookieName: "adminjs",
      cookiePassword: ADMIN_COOKIE_SECRET,
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      secret: ADMIN_COOKIE_SECRET,
    }
  );

  return { admin, adminRouter };
}
