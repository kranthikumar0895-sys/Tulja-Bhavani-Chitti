import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import { ChittiGroup, formatCurrency, getGroups } from "./chittiApi";
import { getApiErrorMessage } from "./auth";

const Dashboard: React.FC = () => {
  const [groups, setGroups] = useState<ChittiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getGroups()
      .then(setGroups)
      .catch((requestError: unknown) =>
        setError(getApiErrorMessage(requestError, "Could not load chitti groups."))
      )
      .then(() => setLoading(false));
  }, []);

  const memberCount = groups.reduce((total, group) => total + group.total_members, 0);
  const collectionTotal = groups.reduce((total, group) => total + group.total_collected, 0);
  const pendingTotal = groups.reduce((total, group) => total + group.total_pending, 0);
  const dueTotal = collectionTotal + pendingTotal;
  const collectionProgress = dueTotal ? (collectionTotal / dueTotal) * 100 : 0;

  const stats = [
    { label: "Active chittis", value: groups.length.toString(), icon: <SavingsRoundedIcon />, tone: "violet" },
    { label: "Members across groups", value: memberCount.toString(), icon: <GroupsRoundedIcon />, tone: "blue" },
    { label: "Collected this month", value: formatCurrency(collectionTotal), icon: <PaymentsRoundedIcon />, tone: "green" },
    { label: "Still to collect", value: formatCurrency(pendingTotal), icon: <TrendingUpRoundedIcon />, tone: "amber" },
  ];

  return (
    <Box className="page-content">
      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">YOUR OVERVIEW</Typography>
          <Typography variant="h4" className="page-title">Good to see you</Typography>
          <Typography color="text.secondary">A live view of every chitti and this month&apos;s collections.</Typography>
        </Box>
        <Button variant="contained" onClick={() => navigate("/chitti-group")} endIcon={<ArrowForwardRoundedIcon />}>
          Manage chittis
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {loading ? (
        <Box className="loading-state"><CircularProgress /></Box>
      ) : (
        <>
          <Box className="stats-grid">
            {stats.map((stat) => (
              <Card className={`stat-card ${stat.tone}`} key={stat.label} elevation={0}>
                <CardContent>
                  <Box className="stat-icon">{stat.icon}</Box>
                  <Typography className="stat-label">{stat.label}</Typography>
                  <Typography className="stat-value">{stat.value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Card className="collection-card" elevation={0}>
            <Box className="collection-copy">
              <Box className="collection-title">
                <Box className="collection-badge"><PaymentsRoundedIcon /></Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Monthly collection progress</Typography>
                  <Typography color="text.secondary">Across all active chittis</Typography>
                </Box>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 750 }}>
                {dueTotal ? `${Math.round(collectionProgress)}%` : "—"}
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={collectionProgress} className="collection-progress" />
            <Stack direction="row" sx={{ justifyContent: "space-between", mt: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Collected {formatCurrency(collectionTotal)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Monthly total {formatCurrency(dueTotal)}
              </Typography>
            </Stack>
          </Card>

          <Box className="section-heading">
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 750 }}>Your chittis</Typography>
              <Typography color="text.secondary">Select a group to see its members and payment schedule.</Typography>
            </Box>
            <Button variant="text" onClick={() => navigate("/chitti-group")}>View all</Button>
          </Box>

          {groups.length ? (
            <Box className="chitti-grid">
              {groups.map((group) => {
                const percentPaid = group.total_members
                  ? (group.paid_count / group.total_members) * 100
                  : 0;
                return (
                  <Card
                    className="chitti-card"
                    elevation={0}
                    key={group.id}
                    onClick={() => navigate(`/chitti-details/${group.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") navigate(`/chitti-details/${group.id}`);
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <CardContent>
                      <Box className="chitti-card-top">
                        <Box className="chitti-avatar"><SavingsRoundedIcon /></Box>
                        <Typography className="status-pill">{group.current_month} / {group.months} months</Typography>
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 750 }} className="chitti-name">
                        {group.chitti_name}
                      </Typography>
                      <Typography color="text.secondary">
                        {group.total_members} members · {formatCurrency(group.monthly_installment)} monthly each
                      </Typography>
                      <Box className="mini-progress-label">
                        <Typography variant="body2">Month {group.current_month} collected</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{group.paid_count}/{group.total_members}</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={percentPaid} className="mini-progress" />
                      <Box className="chitti-card-bottom">
                        <Typography variant="body2" color="text.secondary">
                          {formatCurrency(group.total_collected)} collected
                        </Typography>
                        <ArrowForwardRoundedIcon fontSize="small" />
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          ) : (
            <Card className="empty-state" elevation={0}>
              <Box className="empty-icon"><SavingsRoundedIcon /></Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Your first chitti starts here</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
                Create a group and add its members to see live totals and payment progress.
              </Typography>
              <Button variant="contained" onClick={() => navigate("/chitti-group")}>Create a chitti</Button>
            </Card>
          )}
        </>
      )}
    </Box>
  );
};

export default Dashboard;
