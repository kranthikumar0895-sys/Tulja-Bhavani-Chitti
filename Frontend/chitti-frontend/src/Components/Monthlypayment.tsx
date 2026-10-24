import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import { api, ChittiGroup, formatCurrency, getGroup, getGroups } from "./chittiApi";
import { getApiErrorMessage } from "./auth";

const MonthlyPayments: React.FC = () => {
  const [groups, setGroups] = useState<ChittiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    getGroups()
      .then(setGroups)
      .catch((requestError: unknown) =>
        setError(getApiErrorMessage(requestError, "Could not load payment data."))
      )
      .then(() => setLoading(false));
  }, []);

  const changeMonth = async (groupId: number, month: number) => {
    setError("");
    try {
      const updated = await getGroup(groupId, month);
      setGroups((current) => current.map((group) => group.id === groupId ? updated : group));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not load payments for that month."));
    }
  };

  const savePayment = async (group: ChittiGroup, memberId: number, amount: string) => {
    const key = `${group.id}-${group.selected_month}-${memberId}`;
    const amountPaid = Number(amount);
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      setError("Enter a valid payment amount of zero or more.");
      return;
    }
    setBusy(`${key}-payment`);
    setError("");
    try {
      const response = await api.post<ChittiGroup>(`/chitti/id/${group.id}/payments`, {
        member_id: memberId,
        month: group.selected_month,
        amount_paid: amountPaid,
      });
      setGroups((current) => current.map((item) => item.id === group.id ? response.data : item));
      setAmountDrafts((current) => {
        const updated = { ...current };
        delete updated[key];
        return updated;
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not update this payment."));
    } finally {
      setBusy("");
    }
  };

  const saveComment = async (
    group: ChittiGroup,
    memberId: number,
    comment: string
  ) => {
    const key = `${group.id}-${group.selected_month}-${memberId}`;
    setBusy(`${key}-comment`);
    setError("");
    try {
      const response = await api.put<{ monthly_comment: string }>(`/chitti/id/${group.id}/comments`, {
        member_id: memberId,
        month: group.selected_month,
        comment,
      });
      setGroups((current) => current.map((item) =>
        item.id === group.id
          ? {
              ...item,
              members: item.members.map((member) =>
                member.id === memberId
                  ? { ...member, monthly_comment: response.data.monthly_comment }
                  : member
              ),
            }
          : item
      ));
      setCommentDrafts((current) => {
        const updated = { ...current };
        delete updated[key];
        return updated;
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not save this comment."));
    } finally {
      setBusy("");
    }
  };

  const collected = groups.reduce((sum, group) => sum + group.total_collected, 0);
  const outstanding = groups.reduce((sum, group) => sum + group.total_pending, 0);

  return (
    <Box className="page-content">
      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">COLLECTIONS</Typography>
          <Typography variant="h4" className="page-title">Monthly payments</Typography>
          <Typography color="text.secondary">Review and update member payments for each chitti.</Typography>
        </Box>
        <Box className="payments-totals">
          <Box><Typography className="stat-label">Collected</Typography><Typography sx={{ fontWeight: 750 }}>{formatCurrency(collected)}</Typography></Box>
          <Box><Typography className="stat-label">Outstanding</Typography><Typography sx={{ fontWeight: 750 }}>{formatCurrency(outstanding)}</Typography></Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box className="loading-state"><CircularProgress /></Box>
      ) : groups.length ? (
        <Stack spacing={2}>
          {groups.map((group) => {
            const percentPaid = group.total_members
              ? (group.paid_count / group.total_members) * 100
              : 0;
            return (
              <Card className="payments-group-card" elevation={0} key={group.id}>
                <CardContent>
                  <Box className="payments-group-heading">
                    <Box className="payments-group-title">
                      <Box className="chitti-avatar"><PaymentsRoundedIcon /></Box>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 750 }}>{group.chitti_name}</Typography>
                        <Typography color="text.secondary">
                          {group.paid_count} of {group.total_members} members paid · {formatCurrency(group.total_collected)} collected
                        </Typography>
                      </Box>
                    </Box>
                    <TextField
                      select
                      size="small"
                      label="Payment month"
                      value={group.selected_month}
                      onChange={(event) => changeMonth(group.id, Number(event.target.value))}
                      sx={{ minWidth: 145 }}
                    >
                      {Array.from({ length: group.months }, (_, index) => index + 1).map((month) => (
                        <MenuItem key={month} value={month}>Month {month}</MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <LinearProgress variant="determinate" value={percentPaid} className="mini-progress payments-progress" />
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Member</TableCell>
                          <TableCell align="right">Monthly payable</TableCell>
                          <TableCell align="right">Paid this month</TableCell>
                          <TableCell align="right">Previous months due</TableCell>
                          <TableCell align="right">Total due</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Comment</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {group.members.map((member) => {
                          const key = `${group.id}-${group.selected_month}-${member.id}`;
                          return (
                            <TableRow key={member.id} hover>
                              <TableCell>{member.name}</TableCell>
                              <TableCell align="right">{formatCurrency(member.payable)}</TableCell>
                              <TableCell align="right">
                                <TextField
                                  type="number"
                                  size="small"
                                  value={amountDrafts[key] ?? String(member.amount_paid)}
                                  onChange={(event) =>
                                    setAmountDrafts((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  slotProps={{
                                    htmlInput: {
                                      min: 0,
                                      max: member.amount_paid + member.due_amount,
                                      step: 0.01,
                                      "aria-label": `Amount paid this month for ${member.name}`,
                                    },
                                  }}
                                  sx={{ width: 130 }}
                                />
                              </TableCell>
                              <TableCell align="right">{formatCurrency(member.prior_month_due)}</TableCell>
                              <TableCell align="right">{formatCurrency(member.due_amount)}</TableCell>
                              <TableCell>
                                <Chip
                                  label={member.has_paid ? "Current month paid" : "Due"}
                                  color={member.has_paid ? "success" : "warning"}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  size="small"
                                  multiline
                                  maxRows={3}
                                  value={commentDrafts[key] ?? member.monthly_comment}
                                  onChange={(event) =>
                                    setCommentDrafts((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  slotProps={{
                                    htmlInput: {
                                      maxLength: 2000,
                                      "aria-label": `Comment for ${member.name} in month ${group.selected_month}`,
                                    },
                                  }}
                                  sx={{ minWidth: 180 }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() =>
                                    savePayment(
                                      group,
                                      member.id,
                                      amountDrafts[key] ?? String(member.amount_paid)
                                    )
                                  }
                                  disabled={busy === `${key}-payment`}
                                >
                                  {busy === `${key}-payment` ? "Saving..." : "Save payment"}
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() =>
                                    saveComment(
                                      group,
                                      member.id,
                                      commentDrafts[key] ?? member.monthly_comment
                                    )
                                  }
                                  disabled={busy === `${key}-comment`}
                                >
                                  {busy === `${key}-comment` ? "Saving..." : "Save comment"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      ) : (
        <Card className="empty-state" elevation={0}>
          <Box className="empty-icon"><PaymentsRoundedIcon /></Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Nothing to collect yet</Typography>
          <Typography color="text.secondary">Create a chitti group first to see monthly payments here.</Typography>
        </Card>
      )}
    </Box>
  );
};

export default MonthlyPayments;
