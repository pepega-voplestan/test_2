import React, { useState, useEffect } from "react";
import { ApiClient } from "adminjs";
import { Box, Link, Table, TableBody, TableRow, TableCell, TableHead, Text, Button } from "@adminjs/design-system";

const api = new ApiClient();

const TABS = [
  { key: "Shout", label: "Вопли", joinKey: "user_id" },
  { key: "Comment", label: "Комментарии", joinKey: "user_id" },
  { key: "Media", label: "Медиа", joinKey: "user_id" },
];

const PAGE_SIZE = 10;

function RelatedTable({ resourceId, joinKey, userId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    api.resourceAction({
      resourceId,
      actionName: "list",
      params: {
        [`filters.${joinKey}`]: userId,
        page,
        perPage: PAGE_SIZE,
        direction: "desc",
        sortBy: "created_at",
      },
    }).then((res) => {
      setRecords(res.data.records || []);
      setTotal(res.data.meta?.total || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [resourceId, joinKey, userId, page]);

  if (loading) {
    return React.createElement(Text, { py: "lg", color: "grey60" }, "Загрузка...");
  }

  if (!records.length) {
    return React.createElement(Text, { py: "lg", color: "grey60" }, "Нет записей");
  }

  const keys = Object.keys(records[0].params).filter(
    (k) => !k.startsWith("_") && !["password_hash"].includes(k)
  );
  const visibleKeys = keys.slice(0, 6);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return React.createElement(Box, null,
    React.createElement(Table, null,
      React.createElement(TableHead, null,
        React.createElement(TableRow, null,
          visibleKeys.map((k) =>
            React.createElement(TableCell, { key: k, style: { fontWeight: 600, fontSize: 12, textTransform: "uppercase", color: "#6B7280" } }, k)
          ),
          React.createElement(TableCell, { key: "_actions", style: { fontWeight: 600, fontSize: 12 } }, "")
        )
      ),
      React.createElement(TableBody, null,
        records.map((r) =>
          React.createElement(TableRow, { key: r.id },
            visibleKeys.map((k) =>
              React.createElement(TableCell, { key: k, style: { maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                String(r.params[k] ?? "").slice(0, 80)
              )
            ),
            React.createElement(TableCell, { key: "_actions" },
              React.createElement(Link, {
                href: `/admin/resources/${resourceId}/records/${r.id}/show`,
                style: { fontSize: 12 },
              }, "Открыть")
            )
          )
        )
      )
    ),
    totalPages > 1 && React.createElement(Box, { flex: true, justifyContent: "space-between", alignItems: "center", mt: "lg" },
      React.createElement(Text, { color: "grey60", fontSize: "sm" },
        `${total} записей, стр. ${page} из ${totalPages}`
      ),
      React.createElement(Box, { flex: true, style: { gap: 8 } },
        React.createElement(Button, { size: "sm", variant: "outlined", disabled: page <= 1, onClick: () => setPage((p) => p - 1) }, "←"),
        React.createElement(Button, { size: "sm", variant: "outlined", disabled: page >= totalPages, onClick: () => setPage((p) => p + 1) }, "→")
      )
    )
  );
}

const UserRelatedRecords = (props) => {
  const { record } = props;
  const userId = record?.params?.id;
  const [activeTab, setActiveTab] = useState("Shout");

  if (!userId) return null;

  return React.createElement(Box, { variant: "card", mt: "xl" },
    React.createElement(Box, { flex: true, style: { gap: 8 }, mb: "lg" },
      TABS.map((tab) =>
        React.createElement(Button, {
          key: tab.key,
          size: "sm",
          variant: activeTab === tab.key ? "contained" : "outlined",
          onClick: () => setActiveTab(tab.key),
        }, tab.label)
      )
    ),
    TABS.filter((t) => t.key === activeTab).map((tab) =>
      React.createElement(RelatedTable, {
        key: tab.key,
        resourceId: tab.key,
        joinKey: tab.joinKey,
        userId,
      })
    )
  );
};

export default UserRelatedRecords;
