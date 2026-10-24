import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import { api, ChittiGroup, formatCurrency, getGroups } from "./chittiApi";
import { getApiErrorMessage } from "./auth";

const EXAMPLE_MEMBERS = [
  "Aarav Sharma", "Ananya Rao", "Arjun Patel", "Asha Reddy", "Dev Mehta",
  "Diya Nair", "Ishaan Kumar", "Kavya Shah", "Kiran Joshi", "Maya Iyer",
  "Meera Das", "Neel Kapoor", "Nisha Verma", "Om Prakash", "Pooja Menon",
  "Rahul Singh", "Riya Gupta", "Rohan Nair", "Sana Khan", "Vikram Rao",
].join(", ");

const ChittiGroupPage: React.FC = () => {
  const [groups, setGroups] = useState<ChittiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState(24);
  const [membersText, setMembersText] = useState(EXAMPLE_MEMBERS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadGroups = useCallback(() => getGroups().then(setGroups), []);

  useEffect(() => {
    loadGroups()
      .catch((requestError: unknown) =>
        setError(getApiErrorMessage(requestError, "Could not load chittis."))
      )
      .then(() => setLoading(false));
  }, [loadGroups]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const members = membersText.split(",").map((member) => member.trim()).filter(Boolean);
    try {
      await api.post("/chitti/create", {
        chitti_name: name.trim(),
        amount: Number(amount),
        members,
        months,
      });
      await loadGroups();
      setDialogOpen(false);
      setName("");
      setAmount("");
      setMonths(24);
      setMembersText(EXAMPLE_MEMBERS);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Could not create the chitti."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box className="page-content">
      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">GROUP MANAGEMENT</Typography>
          <Typography variant="h4" className="page-title">Chitti groups</Typography>
          <Typography color="text.secondary">Your groups, their members, and live collection status.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { setError(""); setDialogOpen(true); }}>
          New chitti
        </Button>
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
              <Card className="group-row-card" key={group.id} elevation={0}>
                <CardContent className="group-row-content">
                  <Box className="group-summary">
                    <Box className="chitti-avatar"><SavingsRoundedIcon /></Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" sx={{ fontWeight: 750 }}>{group.chitti_name}</Typography>
                      <Typography color="text.secondary">
                        {formatCurrency(group.total_amount)} · {group.months} months · {group.total_members} members
                      </Typography>
                    </Box>
                  </Box>
                  <Box className="group-members">
                    <Typography className="eyebrow">MEMBERS</Typography>
                    <Box className="member-chip-list">
                      {group.members.map((member) => (
                        <Chip key={member.id} label={member.name} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>
                  <Box className="group-progress">
                    <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.75 }}>
                      <Typography variant="body2" color="text.secondary">Month {group.current_month} collection</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{group.paid_count}/{group.total_members} paid</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={percentPaid} className="mini-progress" />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      {formatCurrency(group.total_pending)} pending
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    endIcon={<ArrowForwardRoundedIcon />}
                    onClick={() => navigate(`/chitti-details/${group.id}`)}
                  >
                    Details
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      ) : (
        <Card className="empty-state" elevation={0}>
          <Box className="empty-icon"><GroupsRoundedIcon /></Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>No chitti groups yet</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
            Create a group to add its members and choose a monthly schedule.
          </Typography>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen(true)}>
            Create your first chitti
          </Button>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={handleCreate}>
          <DialogTitle>Create a chitti</DialogTitle>
          <DialogContent>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              Choose the total value and duration. Member names can be updated later.
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
            <TextField
              label="Group name"
              required
              fullWidth
              margin="dense"
              value={name}
              onChange={(event) => setName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              label="Total chitti amount (₹)"
              required
              type="number"
              fullWidth
              margin="dense"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              slotProps={{ htmlInput: { min: 1, step: 0.01 } }}
            />
            <TextField
              label="Schedule duration (months)"
              required
              type="number"
              fullWidth
              margin="dense"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 60, step: 1 } }}
              helperText="Choose between 1 and 60 months. Monthly values recalculate from the selected duration."
            />
            <TextField
              label="Member names (comma separated)"
              fullWidth
              required
              multiline
              minRows={4}
              margin="dense"
              value={membersText}
              onChange={(event) => setMembersText(event.target.value)}
              helperText="Example names are pre-filled for convenience. Edit or replace the list; duplicate names are not allowed."
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? "Creating..." : `Create ${months}-month chitti`}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
};

export default ChittiGroupPage;
