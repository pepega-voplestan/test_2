const SessionUser = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    avatar: { type: "string" },
  },
};

const UserRef = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    avatar: { type: "string" },
    isBanned: { type: "boolean" },
  },
};

const MediaDto = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["image", "youtube"] },
    url: { type: "string", description: "Relative path for images, YouTube video ID for youtube type" },
    meta: {
      type: "object",
      properties: {
        w: { type: "integer" },
        h: { type: "integer" },
        size: { type: "integer" },
        mime: { type: "string" },
        animated: { type: "boolean" },
      },
    },
    gifUrl: { type: "string", description: "Relative path to the original GIF (animated images only)" },
  },
};

const CommentDto = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    shoutId: { type: "string", format: "uuid" },
    user: { $ref: "#/components/schemas/UserRef" },
    content: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    likes: { type: "integer" },
    likedBy: { type: "array", items: { type: "string", format: "uuid" }, description: "IDs of users who liked this comment (only current user's ID is included)" },
    media: { $ref: "#/components/schemas/MediaDto" },
  },
};

const ShoutDto = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    user: { $ref: "#/components/schemas/UserRef" },
    content: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    likes: { type: "integer" },
    likedBy: { type: "array", items: { type: "string", format: "uuid" }, description: "IDs of users who liked this shout (only current user's ID is included)" },
    media: { $ref: "#/components/schemas/MediaDto" },
    comments: { type: "array", items: { $ref: "#/components/schemas/CommentDto" } },
    isPinned: { type: "boolean", description: "Whether this shout is pinned to the top of the feed" },
  },
};

const Profile = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    avatar: { type: "string" },
    isBanned: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    shoutCount: { type: "integer" },
    email: { type: "string", format: "email", description: "Only present when viewing own profile" },
    isOwner: { type: "boolean" },
  },
};

const Announcement = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    content: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
  },
};

const OkResponse = {
  type: "object",
  properties: { ok: { type: "boolean", example: true } },
};

const ErrorResponse = {
  type: "object",
  properties: { error: { type: "string" } },
};

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Вопли API",
    version: "1.0.0",
    description: "REST API for Вопли — a shout-based social app. All endpoints are prefixed with `/api/v1`. Auth is session-based (cookie). The `/api/v1/events` endpoint streams Server-Sent Events for real-time updates.",
  },
  tags: [
    { name: "misc", description: "Health check, current session, SSE stream" },
    { name: "auth", description: "Registration, login, logout, password reset" },
    { name: "shouts", description: "Shout CRUD and replies" },
    { name: "comments", description: "Comment deletion and likes" },
    { name: "users", description: "User profiles and mention autocomplete" },
    { name: "announcements", description: "Announcement read/write" },
    { name: "upload", description: "Media and avatar uploads" },
  ],
  components: {
    schemas: { SessionUser, UserRef, MediaDto, CommentDto, ShoutDto, Profile, Announcement, OkResponse, ErrorResponse },
  },
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["misc"],
        summary: "Health check",
        responses: {
          200: { description: "Server is up", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
        },
      },
    },

    "/api/v1/me": {
      get: {
        tags: ["misc"],
        summary: "Get current session user",
        responses: {
          200: {
            description: "Current session (user is null when not logged in)",
            content: { "application/json": { schema: { type: "object", properties: { user: { oneOf: [{ $ref: "#/components/schemas/SessionUser" }, { type: "null" }] } } } } },
          },
        },
      },
    },

    "/api/v1/events": {
      get: {
        tags: ["misc"],
        summary: "SSE real-time event stream",
        description: "Server-Sent Events stream. Events: `new_shout`, `delete_shout`, `new_comment`, `delete_comment`, `shout_like`, `comment_like`. Heartbeat ping every 30s.",
        responses: {
          200: { description: "text/event-stream — keep-alive SSE connection", content: { "text/event-stream": { schema: { type: "string" } } } },
        },
      },
    },

    "/api/v1/auth/register/send-code": {
      post: {
        tags: ["auth"],
        summary: "Step 1: send email verification code",
        description: "Validates inputs, checks username/email uniqueness, and emails a 6-digit code. Rate limited to 20 req/min.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password", "email"],
                properties: {
                  username: { type: "string", minLength: 3, maxLength: 32 },
                  password: { type: "string", minLength: 6, maxLength: 200 },
                  email: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Code sent", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          409: { description: "Username or email already taken", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/auth/register/verify": {
      post: {
        tags: ["auth"],
        summary: "Step 2: verify code and create account",
        description: "Verifies the 6-digit code, creates the user, and starts a session. Rate limited to 20 req/min.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "code"],
                properties: {
                  email: { type: "string", format: "email" },
                  code: { type: "string", minLength: 6, maxLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Account created and logged in",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, user: { $ref: "#/components/schemas/SessionUser" } } } } },
          },
          400: { description: "Invalid or expired code", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          409: { description: "Username or email taken (race condition)", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Login",
        description: "Accepts username or email in the `login` field. Rate limited to 20 req/min.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["login", "password"],
                properties: {
                  login: { type: "string", description: "Username or email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, user: { $ref: "#/components/schemas/SessionUser" } } } } },
          },
          401: { description: "Wrong credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Account is banned", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Logout",
        description: "Destroys the current session.",
        responses: {
          200: { description: "Logged out", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
        },
      },
    },

    "/api/v1/auth/forgot-password/send-code": {
      post: {
        tags: ["auth"],
        summary: "Step 1: send password reset code",
        description: "Sends a reset code to the given email. Always returns `{ ok: true }` even if the email is not found (to avoid enumeration). Rate limited to 5 req/min.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Code sent (or silently skipped if email not found)", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          400: { description: "Invalid email", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/auth/forgot-password/reset": {
      post: {
        tags: ["auth"],
        summary: "Step 2: verify code and set new password",
        description: "Verifies the reset code, updates the password, and auto-logs the user in. Rate limited to 20 req/min.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "code", "newPassword"],
                properties: {
                  email: { type: "string", format: "email" },
                  code: { type: "string", minLength: 6, maxLength: 6 },
                  newPassword: { type: "string", minLength: 6, maxLength: 200 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Password reset and auto-logged in",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, user: { $ref: "#/components/schemas/SessionUser" } } } } },
          },
          400: { description: "Invalid or expired code", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Account is banned", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/shouts": {
      get: {
        tags: ["shouts"],
        summary: "List shouts",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "sortBy", in: "query", schema: { type: "string", enum: ["new", "popular"], default: "new" }, description: "`popular` returns shouts from the last 7 days ordered by like count" },
        ],
        responses: {
          200: {
            description: "Paginated list of shouts with comments and like info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    shouts: { type: "array", items: { $ref: "#/components/schemas/ShoutDto" } },
                    hasMore: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["shouts"],
        summary: "Create a shout",
        description: "Requires auth. Must have `content`, `mediaId`, or `youtubeUrl` — cannot have both `mediaId` and `youtubeUrl`. YouTube URLs in content are auto-detected. Rate limited to 100 req/10min per user.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: { type: "string", maxLength: 400, description: "Effective length: each newline costs 40 chars" },
                  mediaId: { type: "string", format: "uuid", description: "ID of a previously uploaded media record" },
                  youtubeUrl: { type: "string", description: "YouTube URL — metadata fetched from oEmbed" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Shout created",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, id: { type: "string", format: "uuid" } } } } },
          },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/shouts/{id}": {
      delete: {
        tags: ["shouts"],
        summary: "Delete a shout (soft-delete)",
        description: "Author only. Also soft-deletes all comments on the shout.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          403: { description: "Not the author", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/shouts/{id}/replies": {
      post: {
        tags: ["shouts"],
        summary: "Add a comment to a shout",
        description: "Requires auth. Same content rules as shouts (400 effective chars).",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: { type: "string", maxLength: 400 },
                  mediaId: { type: "string", format: "uuid" },
                  youtubeUrl: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Comment created",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, id: { type: "string", format: "uuid" }, media: { $ref: "#/components/schemas/MediaDto" } } } } },
          },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          404: { description: "Shout not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/shouts/{id}/like": {
      post: {
        tags: ["shouts"],
        summary: "Toggle like on a shout",
        description: "Requires auth. Adds the like if absent, removes it if present.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: {
            description: "New like state",
            content: { "application/json": { schema: { type: "object", properties: { likes: { type: "integer" }, isLiked: { type: "boolean" } } } } },
          },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/comments/{id}": {
      delete: {
        tags: ["comments"],
        summary: "Delete a comment (soft-delete)",
        description: "Author only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          403: { description: "Not the author", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/comments/{id}/like": {
      post: {
        tags: ["comments"],
        summary: "Toggle like on a comment",
        description: "Requires auth.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: {
            description: "New like state",
            content: { "application/json": { schema: { type: "object", properties: { likes: { type: "integer" }, isLiked: { type: "boolean" } } } } },
          },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/announcements": {
      get: {
        tags: ["announcements"],
        summary: "Get current active announcement",
        description: "Returns the latest non-deleted announcement, or `null` if none.",
        responses: {
          200: {
            description: "Active announcement or null",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    announcement: { oneOf: [{ $ref: "#/components/schemas/Announcement" }, { type: "null" }] },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["announcements"],
        summary: "Create/replace announcement",
        description: "Requires `secret_key` matching the `ANNOUNCEMENTS_SECRET` env var. Soft-deletes all existing active announcements and creates a new one.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content", "secret_key"],
                properties: {
                  content: { type: "string", minLength: 1, maxLength: 5000 },
                  secret_key: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Announcement created",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, id: { type: "string", format: "uuid" } } } } },
          },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Wrong secret key", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/users/mentions": {
      get: {
        tags: ["users"],
        summary: "List users for mention autocomplete",
        description: "Returns all non-banned users. Used to power @-mention suggestions in the composer.",
        responses: {
          200: {
            description: "User list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          avatar: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/v1/users/{id}": {
      get: {
        tags: ["users"],
        summary: "Get user profile",
        description: "Email is only included when the authenticated user is viewing their own profile.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "User profile", content: { "application/json": { schema: { type: "object", properties: { profile: { $ref: "#/components/schemas/Profile" } } } } } },
          404: { description: "User not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      put: {
        tags: ["users"],
        summary: "Update own profile",
        description: "Requires auth. Can update username, email, avatar, and/or password. All fields are optional — only provided fields are changed. Password change requires `currentPassword`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string", minLength: 3, maxLength: 32 },
                  email: { type: "string", format: "email" },
                  avatar: { type: "string", maxLength: 500 },
                  currentPassword: { type: "string" },
                  newPassword: { type: "string", minLength: 6, maxLength: 200 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Profile updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    user: { $ref: "#/components/schemas/SessionUser" },
                    profile: { $ref: "#/components/schemas/Profile" },
                  },
                },
              },
            },
          },
          400: { description: "Validation error or wrong current password", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          403: { description: "Trying to edit another user's profile", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          409: { description: "Username or email already taken", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/users/{id}/shouts": {
      get: {
        tags: ["users"],
        summary: "Get a user's shouts",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          200: {
            description: "Paginated shouts by the user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    shouts: { type: "array", items: { $ref: "#/components/schemas/ShoutDto" } },
                    hasMore: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/v1/upload/media": {
      post: {
        tags: ["upload"],
        summary: "Upload image or GIF",
        description: "Requires auth. Accepts JPG, PNG, WebP, or GIF up to 5 MB. Generates 320/960/1600px WebP variants. GIFs also preserve the original. Rate limited to 100 req/10min per user.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Upload successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    media: { $ref: "#/components/schemas/MediaDto" },
                  },
                },
              },
            },
          },
          400: { description: "File too large, wrong type, or missing", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/upload/avatar": {
      post: {
        tags: ["upload"],
        summary: "Upload avatar",
        description: "Requires auth. Accepts JPG, PNG, or WebP up to 2 MB. Generates 64/128/256px square WebP variants.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Avatar uploaded",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, avatar: { type: "string", description: "New avatar URL path" } } } } },
          },
          400: { description: "File too large, wrong type, or image too small", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          401: { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/v1/avatars/{userId}/{size}.webp": {
      get: {
        tags: ["upload"],
        summary: "Serve avatar file",
        description: "Returns a WebP avatar at the requested size. Immutable 1-day cache headers.",
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "size", in: "path", required: true, schema: { type: "integer", enum: [64, 128, 256] } },
        ],
        responses: {
          200: { description: "WebP image", content: { "image/webp": { schema: { type: "string", format: "binary" } } } },
          404: { description: "Avatar not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
  },
};
