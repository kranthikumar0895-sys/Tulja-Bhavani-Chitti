import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { useNavigate } from "react-router-dom";
import {
  api,
  ChittiGroup,
  formatCurrency,
  getGroup,
  getMemberSchedule,
  MemberSchedule,
  ScheduleMonth,
} from "./chittiApi";
import { getApiErrorMessage } from "./auth";

const ChittiDetails: React.FC = () => {
  const { name } = useParams();
  const groupId = Number(name);
  const navigate = useNavigate();
  const [group, setGroup] = useState<ChittiGroup | null>(null);
  const [schedule, setSchedule] = useState<MemberSchedule | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | "">("");
  const [nameDraft, setNameDraft] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [monthsDraft, setMonthsDraft] = useState(24);
  const [loading, setLoading] = useState(true);
  const [busyMonth, setBusyMonth] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadGroup = useCallback(async () => {
    const data = await getGroup(groupId);
    setGroup(data);
    setSelectedMemberId((current) =>
      current && data.members.some((member) => member.id === current)
        ? current
        : data.members[0]?.id ?? ""
    );
    return data;
  }, [groupId]);

  useEffect(() => {
    if (!Number.isInteger(groupId) || groupId < 1) {
      setError("This chitti link is not valid.");
      setLoading(false);
      return;
    }
    loadGroup()
      .catch((requestError: unknown) =>
        setError(getApiErrorMessage(requestError, "Could not load this chitti."))
      )
      .then(() => setLoading(false));
  }, [groupId, loadGroup]);

  useEffect(() => {
    if (!group || selectedMemberId === "") {
      setSchedule(null);
      return;
    }
    setNameDraft(group.members.find((member) => member.id === selectedMemberId)?.name ?? "");
    getMemberSchedule(group.id, selectedMemberId)
      .then(setSchedule)
      .catch((requestError: unknown) => {
        setError(getApiErrorMessage(requestError, "Could not load the member schedule."));
      });
  }, [group, selectedMemberId]);

  const refresh = async () => {
    await loadGroup();
  };

  const handleRename = async () => {
    if (!group || selectedMemberId === "") return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.put(`/chitti/id/${group.id}/members/${selectedMemberId}`, {
        name: nameDraft.trim(),
      });
      await refresh();
      setNotice("Member name updated.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not update the member name."));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!group) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.post<{ id: number }>(`/chitti/id/${group.id}/members`, {
        name: newMemberName.trim(),
      });
      setNewMemberName("");
      await loadGroup();
      setSelectedMemberId(response.data.id);
      setNotice("Member added to the chitti.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not add the member."));
    } finally {
      setSaving(false);
    }
  };

  const handleSetMonth = async (month: number) => {
    if (!group) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.put<ChittiGroup>(`/chitti/id/${group.id}/month`, { month });
      setGroup(response.data);
      setNotice(`Month ${month} is now the active collection month.`);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not update the active month."));
    } finally {
      setSaving(false);
    }
  };

  const handleEditSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!group) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.put<ChittiGroup>(`/chitti/id/${group.id}`, {
        amount: Number(amountDraft),
        months: monthsDraft,
      });
      setGroup(response.data);
      if (selectedMemberId !== "") {
        setSchedule(await getMemberSchedule(group.id, selectedMemberId));
      }
      setEditScheduleOpen(false);
      setNotice("Chitti value and duration updated. Member schedules have been recalculated.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not update the chitti schedule."));
    } finally {
      setSaving(false);
    }
  };

  const refreshSchedule = async () => {
    if (!group || selectedMemberId === "") return;
    const [updatedGroup, updatedSchedule] = await Promise.all([
      getGroup(group.id),
      getMemberSchedule(group.id, selectedMemberId),
    ]);
    setGroup(updatedGroup);
    setSchedule(updatedSchedule);
  };

  const handlePaymentSave = async (row: ScheduleMonth) => {
    if (!group || selectedMemberId === "") return;
    setBusyMonth(row.month);
    setError("");
    setNotice("");
    try {
      await api.post(`/chitti/id/${group.id}/payments`, {
        member_id: selectedMemberId,
        month: row.month,
        amount_paid: row.amount_paid,
      });
      await refreshSchedule();
      setNotice(`Month ${row.month} payment saved.`);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not update payment status."));
    } finally {
      setBusyMonth(null);
    }
  };

  const handleAmountPaidChange = (month: number, value: number) => {
    setSchedule((current) =>
      current
        ? {
            ...current,
            months: current.months.map((row) =>
              row.month === month ? { ...row, amount_paid: value } : row
            ),
          }
        : current
    );
  };

  const handleCommentChange = (month: number, value: string) => {
    setSchedule((current) =>
      current
        ? {
            ...current,
            months: current.months.map((row) =>
              row.month === month ? { ...row, monthly_comment: value } : row
            ),
          }
        : current
    );
  };

  const handleCommentSave = async (row: ScheduleMonth) => {
    if (!group || selectedMemberId === "") return;
    setBusyMonth(row.month);
    setError("");
    setNotice("");
    try {
      const response = await api.put<{ monthly_comment: string }>(`/chitti/id/${group.id}/comments`, {
        member_id: selectedMemberId,
        month: row.month,
        comment: row.monthly_comment,
      });
      handleCommentChange(row.month, response.data.monthly_comment);
      await refreshSchedule();
      setNotice(`Month ${row.month} comment saved.`);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not save the comment."));
    } finally {
      setBusyMonth(null);
    }
  };

  const handleCustomChange = (month: number, value: number) => {
    setSchedule((current) =>
      current
        ? {
            ...current,
            months: current.months.map((row) =>
              row.month === month
                ? {
                    ...row,
                    custom_amount: value,
                    payable: row.monthly_installment + value,
                  }
                : row
            ),
          }
        : current
    );
  };

  const handleCustomSave = async (row: ScheduleMonth) => {
    if (!group || selectedMemberId === "") return;
    try {
      await api.put(`/chitti/id/${group.id}/custom-amount`, {
        member_id: selectedMemberId,
        month: row.month,
        custom_amount: row.custom_amount,
      });
      setNotice(`Month ${row.month} custom amount saved.`);
      await refreshSchedule();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not save the custom amount."));
    }
  };

  if (loading) return <Box className="loading-state"><CircularProgress /></Box>;
  if (!group) {
    return (
      <Box className="page-content">
        {error && <Alert severity="error">{error}</Alert>}
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/chitti-group")}>
          Back to chittis
        </Button>
      </Box>
    );
  }

  const selectedMember = group.members.find((member) => member.id === selectedMemberId);
  const paidAmount = group.members.reduce(
    (total, member) => total + member.amount_paid,
    0
  );
  return (
    <Box className="page-content">
      <Button className="back-link" startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate("/chitti-group")}>
        All chittis
      </Button>
      <Box className="page-heading details-heading">
        <Box>
          <Typography className="eyebrow">CHITTI DETAILS</Typography>
          <Typography variant="h4" className="page-title">{group.chitti_name}</Typography>
          <Typography color="text.secondary">
            {formatCurrency(group.total_amount)} total · {group.total_members} members · {group.months}-month schedule
          </Typography>
        </Box>
        <Box className="details-actions">
          <TextField
            select
            size="small"
            label="Active collection month"
            value={group.current_month}
            onChange={(event) => handleSetMonth(Number(event.target.value))}
            disabled={saving}
            sx={{ minWidth: 190 }}
          >
            {Array.from({ length: group.months }, (_, index) => index + 1).map((month) => (
              <MenuItem key={month} value={month}>Month {month}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            startIcon={<TuneRoundedIcon />}
            onClick={() => {
              setAmountDraft(String(group.total_amount));
              setMonthsDraft(group.months);
              setError("");
              setEditScheduleOpen(true);
            }}
          >
            Edit value / months
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileDownloadRoundedIcon />}
            onClick={async () => {
              try {
                const response = await api.get<Blob>(`/chitti/id/${group.id}/export`, {
                  responseType: "blob",
                });
                const url = URL.createObjectURL(response.data);
                const link = document.createElement("a");
                link.href = url;
                link.download = `${group.chitti_name.replace(/[^a-z0-9._-]+/gi, "_")}_Export.xlsx`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (requestError) {
                setError(getApiErrorMessage(requestError, "Could not export the chitti schedule."));
              }
            }}
          >
            Export
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Box className="stats-grid details-stats">
        <Card className="detail-metric" elevation={0}>
          <CardContent><Typography className="stat-label">Monthly value</Typography><Typography className="stat-value">{formatCurrency(group.monthly_installment)}</Typography></CardContent>
        </Card>
        <Card className="detail-metric" elevation={0}>
          <CardContent><Typography className="stat-label">5% commission</Typography><Typography className="stat-value">{formatCurrency(group.commission)}</Typography></CardContent>
        </Card>
        <Card className="detail-metric" elevation={0}>
          <CardContent><Typography className="stat-label">Member payable / month</Typography><Typography className="stat-value">{formatCurrency(group.payable_per_member)}</Typography></CardContent>
        </Card>
        <Card className="detail-metric" elevation={0}>
          <CardContent><Typography className="stat-label">Collected · month {group.current_month}</Typography><Typography className="stat-value">{formatCurrency(paidAmount)}</Typography></CardContent>
        </Card>
        <Card className="detail-metric" elevation={0}>
          <CardContent><Typography className="stat-label">Outstanding · month {group.current_month}</Typography><Typography className="stat-value">{formatCurrency(group.total_pending)}</Typography></CardContent>
        </Card>
      </Box>

      <Card className="member-editor-card" elevation={0}>
        <CardContent>
          <Box className="section-heading">
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 750 }}>Members</Typography>
              <Typography color="text.secondary">Choose a member to rename or review their payment schedule.</Typography>
            </Box>
          </Box>
          <Box className="member-tools">
            <TextField
              select
              label="Select member"
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(Number(event.target.value))}
              sx={{ minWidth: 240, flex: 1 }}
              disabled={!group.members.length}
            >
              {group.members.map((member) => (
                <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Edit selected name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              disabled={!selectedMember}
              sx={{ minWidth: 220, flex: 1 }}
            />
            <Button
              variant="outlined"
              startIcon={<SaveRoundedIcon />}
              onClick={handleRename}
              disabled={!selectedMember || saving || !nameDraft.trim()}
            >
              Save name
            </Button>
            <Box component="form" className="add-member-form" onSubmit={handleAddMember}>
              <TextField
                label="Add member"
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                required
                size="small"
              />
              <Button type="submit" variant="contained" startIcon={<PersonAddAltRoundedIcon />} disabled={saving}>
                Add
              </Button>
            </Box>
          </Box>
          {selectedMember && (
            <Box className="member-current-status">
              <Chip
                icon={<CheckCircleRoundedIcon />}
                label={selectedMember.has_paid ? `Paid · ${formatCurrency(selectedMember.payable)}` : `Pending · ${formatCurrency(selectedMember.payable)}`}
                color={selectedMember.has_paid ? "success" : "warning"}
                variant="outlined"
              />
              <Typography variant="body2" color="text.secondary">
                Current month: {group.paid_count} of {group.total_members} members paid
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      <Box className="section-heading schedule-heading">
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 750 }}>
            {schedule?.member_name ?? "Member"} payment schedule
          </Typography>
          <Typography color="text.secondary">
            {group.months}-month formula: value = total ÷ {group.months}; commission = 5%; custom amount is optional.
          </Typography>
        </Box>
      </Box>
      {schedule ? (
        <TableContainer component={Card} className="schedule-table-card" elevation={0}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Value</TableCell>
                <TableCell align="right">Commission (5%)</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Custom</TableCell>
                <TableCell align="right">Payable</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Previous due</TableCell>
                <TableCell align="right">Total due</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Comment</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schedule.months.map((row) => (
                <TableRow key={row.month} hover className={row.month === group.current_month ? "active-month-row" : ""}>
                  <TableCell><strong>Month {row.month}</strong>{row.month === group.current_month && <Chip label="Current" size="small" className="current-month-chip" />}</TableCell>
                  <TableCell align="right">{formatCurrency(row.monthly_installment)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.commission)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.amount_after_commission)}</TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={row.custom_amount}
                      onChange={(event) => handleCustomChange(row.month, Math.max(0, Number(event.target.value)))}
                      onBlur={() => handleCustomSave(row)}
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          step: 0.01,
                          "aria-label": `Custom amount for month ${row.month}`,
                        },
                      }}
                      sx={{ width: 110 }}
                    />
                  </TableCell>
                  <TableCell align="right"><strong>{formatCurrency(row.payable)}</strong></TableCell>
                  <TableCell align="right">
                    <TextField
                      type="number"
                      size="small"
                      value={row.amount_paid}
                      onChange={(event) =>
                        handleAmountPaidChange(row.month, Math.max(0, Number(event.target.value)))
                      }
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          step: 0.01,
                          "aria-label": `Amount paid for month ${row.month}`,
                        },
                      }}
                      sx={{ width: 115 }}
                    />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(row.prior_month_due)}</TableCell>
                  <TableCell align="right">{formatCurrency(row.due_amount)}</TableCell>
                  <TableCell>
                    <Chip label={row.has_paid ? "Paid" : "Pending"} size="small" color={row.has_paid ? "success" : "warning"} />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      multiline
                      maxRows={3}
                      value={row.monthly_comment}
                      onChange={(event) => handleCommentChange(row.month, event.target.value)}
                      slotProps={{
                        htmlInput: {
                          maxLength: 2000,
                          "aria-label": `Comment for month ${row.month}`,
                        },
                      }}
                      sx={{ minWidth: 180 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handlePaymentSave(row)}
                      disabled={busyMonth === row.month}
                    >
                      {busyMonth === row.month ? "Saving..." : "Save payment"}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleCommentSave(row)}
                      disabled={busyMonth === row.month}
                    >
                      Save comment
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Card className="empty-state" elevation={0}>
          <EditRoundedIcon />
          <Typography color="text.secondary">Add a member to view their monthly schedule.</Typography>
        </Card>
      )}

      <Box className="schedule-footnote">
        <Typography variant="body2" color="text.secondary">
          Payments apply to the oldest outstanding month first. Comments and custom values are saved per member and month.
        </Typography>
      </Box>

      <Dialog
        open={editScheduleOpen}
        onClose={() => !saving && setEditScheduleOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={handleEditSchedule}>
          <DialogTitle>Edit chitti value and duration</DialogTitle>
          <DialogContent>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              All member schedules will recalculate from the new total and month count. Existing payment records are retained.
              A shorter schedule cannot remove months with saved payments or custom amounts.
            </Typography>
            <TextField
              label="Total chitti amount (₹)"
              required
              type="number"
              fullWidth
              margin="dense"
              value={amountDraft}
              onChange={(event) => setAmountDraft(event.target.value)}
              slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
            />
            <TextField
              label="Schedule duration (months)"
              required
              type="number"
              fullWidth
              margin="dense"
              value={monthsDraft}
              onChange={(event) => setMonthsDraft(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 60, step: 1 } }}
              helperText="Choose between 1 and 60 months."
            />
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setEditScheduleOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || Number(amountDraft) <= 0 || monthsDraft < 1 || monthsDraft > 60}
            >
              {saving ? "Recalculating..." : "Save and recalculate"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
};

export default ChittiDetails;
