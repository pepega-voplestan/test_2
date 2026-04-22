import React, { useState, useEffect } from "react";
import { ApiClient } from "adminjs";
import { Box, H2, H4, Text, Button, Icon } from "@adminjs/design-system";

const api = new ApiClient();

const PERIOD_OPTIONS = [
  { label: "Сегодня", value: 1 },
  { label: "7 дней", value: 7 },
  { label: "30 дней", value: 30 },
  { label: "90 дней", value: 90 },
  { label: "Всё время", value: 0 },
];

const StatCard = ({ label, value, icon }) => (
  <Box
    variant="card"
    flex
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    p="xl"
    style={{ minWidth: 160, flex: "1 1 0" }}
  >
    {icon && <Icon icon={icon} size={24} mb="default" color="grey60" />}
    <H2 mt="default" mb="sm" style={{ fontSize: 32 }}>{value ?? "—"}</H2>
    <Text color="grey60" textAlign="center">{label}</Text>
  </Box>
);

const TimelineRow = ({ label, count, maxCount }) => {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <Box flex alignItems="center" mb="sm" style={{ gap: 8 }}>
      <Text style={{ width: 90, flexShrink: 0, fontSize: 12 }} color="grey60">{label}</Text>
      <Box style={{ flex: 1, height: 18, background: "var(--grey20, #f0f0f0)", borderRadius: 4, overflow: "hidden" }}>
        <Box style={{ width: `${pct}%`, height: "100%", background: "var(--primary100, #3040d6)", borderRadius: 4, transition: "width 0.3s" }} />
      </Box>
      <Text style={{ width: 50, textAlign: "right", fontSize: 12, flexShrink: 0 }} fontWeight="bold">{count}</Text>
    </Box>
  );
};

const TimelineSection = ({ title, data }) => {
  if (!data || data.length === 0) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <Box variant="card" p="xl" mb="lg">
      <H4 mb="lg">{title}</H4>
      {data.map((d) => (
        <TimelineRow key={d.date} label={d.date} count={d.count} maxCount={maxCount} />
      ))}
    </Box>
  );
};

const OnlineUsersSection = ({ data }) => {
  if (!data || data.length === 0) return (
    <Box variant="card" p="xl" mb="lg">
      <H4 mb="sm">Сейчас онлайн</H4>
      <Text color="grey60">Нет авторизованных пользователей</Text>
    </Box>
  );
  return (
    <Box variant="card" p="xl" mb="lg">
      <H4 mb="lg">Сейчас онлайн ({data.length})</H4>
      <Box flex flexWrap="wrap" style={{ gap: 8 }}>
        {data.map((u) => (
          <Box key={u.id} style={{ background: "var(--primary20, #e8eafc)", borderRadius: 4, padding: "4px 10px" }}>
            <Text style={{ fontSize: 13 }} fontWeight="bold">@{u.username}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const TopCreatorsSection = ({ data }) => {
  if (!data || data.length === 0) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <Box variant="card" p="xl" mb="lg">
      <H4 mb="lg">Топ авторов воплей</H4>
      {data.map((d, i) => (
        <Box key={d.name} flex alignItems="center" mb="sm" style={{ gap: 8 }}>
          <Text style={{ width: 20, flexShrink: 0, fontSize: 12, textAlign: "right" }} color="grey60">{i + 1}.</Text>
          <Text style={{ width: 120, flexShrink: 0, fontSize: 13 }} fontWeight="bold">{d.name}</Text>
          <Box style={{ flex: 1, height: 18, background: "var(--grey20, #f0f0f0)", borderRadius: 4, overflow: "hidden" }}>
            <Box style={{ width: `${(d.count / maxCount) * 100}%`, height: "100%", background: "var(--primary100, #3040d6)", borderRadius: 4, transition: "width 0.3s" }} />
          </Box>
          <Text style={{ width: 50, textAlign: "right", fontSize: 12, flexShrink: 0 }} fontWeight="bold">{d.count}</Text>
        </Box>
      ))}
    </Box>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    api
      .getDashboard({ params: { days } })
      .then((res) => {
        setStats(res.data);
      })
      .catch((err) => console.error("[Dashboard]", err))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !stats) {
    return (
      <Box p="xxl" flex justifyContent="center">
        <Text>Загрузка…</Text>
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box p="xxl" flex justifyContent="center">
        <Text color="error">Не удалось загрузить данные</Text>
      </Box>
    );
  }

  return (
    <Box p="xxl">
      <Box flex alignItems="center" justifyContent="space-between" mb="xl" flexWrap="wrap" style={{ gap: 8 }}>
        <H2>Аналитика</H2>
        <Box flex style={{ gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={days === opt.value ? "primary" : "text"}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Summary cards */}
      <Box flex mb="xl" flexWrap="wrap" style={{ gap: 16 }}>
        <StatCard label="Пользователи" value={stats.totals.users} icon="User" />
        <StatCard label="Вопли" value={stats.totals.shouts} icon="Document" />
        <StatCard label="Комментарии" value={stats.totals.comments} icon="MessageCircle" />
        <StatCard label="Лайки" value={stats.totals.shoutLikes + stats.totals.commentLikes} icon="ThumbsUp" />
        <StatCard label="Медиа" value={stats.totals.media} icon="Image" />
        <StatCard label="Онлайн сейчас" value={stats.totals.live?.total ?? "—"} icon="Group" />
        <StatCard label="Онлайн (авт.)" value={stats.totals.live?.loggedIn ?? "—"} icon="LogIn" />
        <StatCard label="Онлайн (анон.)" value={stats.totals.live?.anon ?? "—"} icon="Eye" />
        <StatCard label="Сессий (Redis)" value={stats.totals.sessions?.total ?? "—"} icon="Archive" />
      </Box>

      {/* Online users */}
      <OnlineUsersSection data={stats.totals.live?.onlineUsers} />

      {/* Top creators */}
      <TopCreatorsSection data={stats.topCreators} />

      {/* Timelines */}
      <Box flex flexWrap="wrap" style={{ gap: 16 }}>
        <Box style={{ flex: "1 1 400px" }}>
          <TimelineSection title="Вопли по дням" data={stats.timeline.shouts} />
        </Box>
        <Box style={{ flex: "1 1 400px" }}>
          <TimelineSection title="Комментарии по дням" data={stats.timeline.comments} />
        </Box>
      </Box>
      <Box flex flexWrap="wrap" style={{ gap: 16 }}>
        <Box style={{ flex: "1 1 400px" }}>
          <TimelineSection title="Лайки по дням" data={stats.timeline.likes} />
        </Box>
        <Box style={{ flex: "1 1 400px" }}>
          <TimelineSection title="Регистрации по дням" data={stats.timeline.users} />
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;
