import AdminJS from "adminjs";
import AdminJSExpress from "@adminjs/express";
import { Database, Resource, getModelByName } from "@adminjs/prisma";
import { prisma } from "./db.js";
import { verifyPassword } from "./auth.js";

AdminJS.registerAdapter({ Database, Resource });

export async function setupAdmin() {
  const admin = new AdminJS({
    rootPath: "/admin",
    loginPath: "/admin/login",
    logoutPath: "/admin/logout",
    resources: [
      // ── Users: view, ban/unban via edit ──
      {
        resource: { model: getModelByName("User"), client: prisma },
        options: {
          navigation: { name: "Пользователи", icon: "User" },
          properties: {
            password_hash: { isVisible: false },
            id: { isDisabled: true },
            created_at: { isDisabled: true },
            // Hide reverse relations to unregistered resources
            shoutLikes: { isVisible: false },
            commentLikes: { isVisible: false },
            receivedNotifications: { isVisible: false },
            sentNotifications: { isVisible: false },
          },
          actions: {
            new: { isAccessible: false },
            delete: { isAccessible: false },
          },
        },
      },

      // ── Shouts: soft-delete (default), restore, hard-delete ──
      {
        resource: { model: getModelByName("Shout"), client: prisma },
        options: {
          navigation: { name: "Контент", icon: "Document" },
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
