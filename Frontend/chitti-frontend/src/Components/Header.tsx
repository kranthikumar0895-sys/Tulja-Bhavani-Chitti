import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import PasswordRoundedIcon from "@mui/icons-material/PasswordRounded";
import { getApiErrorMessage } from "./auth";
import { api } from "./chittiApi";

interface UserAccount {
  username: string;
  role: string;
  email: string | null;
}

const Header: React.FC = () => {
  const [isOwner, setIsOwner] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [recoveryEmailTarget, setRecoveryEmailTarget] = useState<UserAccount | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [userMessageIsError, setUserMessageIsError] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newOwnPassword, setNewOwnPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageIsError, setPasswordMessageIsError] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    api.get<UserAccount>("/auth/me")
      .then(({ data }) => setIsOwner(data.role === "owner"))
      .catch((error: unknown) => {
        console.error("Could not load account permissions", error);
      });
  }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get<UserAccount[]>("/auth/users");
      setUsers(response.data);
    } catch (error) {
      setUserMessage(getApiErrorMessage(error, "Could not load user accounts."));
      setUserMessageIsError(true);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (localStorage.getItem("access_token")) {
        await api.post("/auth/logout", {});
      }
    } catch (error) {
      console.error("Could not revoke the server session", error);
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
  };

  const handleAddUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserMessage("");
    setSavingUser(true);
    try {
      await api.post(
        "/auth/users",
        {
          username: newUsername.trim(),
          email: newUserEmail.trim(),
          password: newPassword,
        },
      );
      setUserMessage("Account created. Share the password privately with the new user.");
      setUserMessageIsError(false);
      setNewUsername("");
      setNewUserEmail("");
      setNewPassword("");
      await loadUsers();
    } catch (error) {
      setUserMessage(getApiErrorMessage(error, "Could not create the account."));
      setUserMessageIsError(true);
    } finally {
      setSavingUser(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget) return;
    setSavingUser(true);
    setUserMessage("");
    setUserMessageIsError(false);
    try {
      await api.put(`/auth/users/${encodeURIComponent(resetTarget)}/password`, {
        password: resetPassword,
      });
      setResetTarget(null);
      setResetPassword("");
      setUserMessage(`Password reset for ${resetTarget}. Their existing sessions have been signed out; share the new password privately.`);
      setUserMessageIsError(false);
    } catch (error) {
      setUserMessage(getApiErrorMessage(error, "Could not reset the user's password."));
      setUserMessageIsError(true);
    } finally {
      setSavingUser(false);
    }
  };

  const handleUpdateRecoveryEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recoveryEmailTarget) return;
    setSavingUser(true);
    setUserMessage("");
    setUserMessageIsError(false);
    try {
      await api.put(
        `/auth/users/${encodeURIComponent(recoveryEmailTarget.username)}/email`,
        { email: recoveryEmail.trim() }
      );
      setRecoveryEmailTarget(null);
      setRecoveryEmail("");
      setUserMessage(`Recovery email updated for ${recoveryEmailTarget.username}.`);
      await loadUsers();
    } catch (error) {
      setUserMessage(getApiErrorMessage(error, "Could not update the recovery email."));
      setUserMessageIsError(true);
    } finally {
      setSavingUser(false);
    }
  };

  const handleChangeOwnPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordMessage("");
    try {
      await api.put("/auth/change-password", {
        current_password: currentPassword,
        new_password: newOwnPassword,
      });
      setCurrentPassword("");
      setNewOwnPassword("");
      setPasswordMessage("Your password was changed. Other signed-in devices have been signed out.");
      setPasswordMessageIsError(false);
    } catch (error) {
      setPasswordMessage(getApiErrorMessage(error, "Could not change your password."));
      setPasswordMessageIsError(true);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Box component="header" className="app-header">
      <Box>
        <Typography className="header-kicker">CHITTI MANAGER</Typography>
        <Typography variant="body2" color="text.secondary">
          Signed in as <strong>{localStorage.getItem("user") ?? "User"}</strong>
        </Typography>
      </Box>
      <Box className="header-actions">
        {isOwner && (
          <Button
            variant="outlined"
            startIcon={<PersonAddAltRoundedIcon />}
            onClick={() => {
              setUserMessage("");
              setUserDialogOpen(true);
              void loadUsers();
            }}
          >
            Manage users
          </Button>
        )}
        <Button
          variant="text"
          color="inherit"
          startIcon={<PasswordRoundedIcon />}
          onClick={() => {
            setPasswordMessage("");
            setChangePasswordOpen(true);
          }}
        >
          Change password
        </Button>
        <Button variant="text" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>
          Sign out
        </Button>
      </Box>

      <Dialog
        open={userDialogOpen}
        onClose={() => !savingUser && setUserDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={handleAddUser}>
          <DialogTitle>Manage user accounts</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 1 }}>
                Create customer accounts with a recovery email, update existing recovery emails, or set a customer's password. Passwords must have at least 10 characters.
            </Alert>
            {userMessage && (
              <Alert severity={userMessageIsError ? "error" : "success"} sx={{ mb: 1 }}>
                {userMessage}
              </Alert>
            )}
            <TextField
              label="Username"
              autoComplete="username"
              required
              slotProps={{ htmlInput: { minLength: 3, maxLength: 64 } }}
              fullWidth
              margin="dense"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
            />
            <TextField
              label="Recovery email"
              type="email"
              autoComplete="email"
              required
              fullWidth
              margin="dense"
              value={newUserEmail}
              onChange={(event) => setNewUserEmail(event.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
              fullWidth
              margin="dense"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setUserDialogOpen(false)} disabled={savingUser}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingUser}>
              {savingUser ? "Creating..." : "Create account"}
            </Button>
          </DialogActions>
        </Box>
        <DialogContent dividers>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Accounts</Typography>
          {loadingUsers ? (
            <Typography color="text.secondary">Loading accounts...</Typography>
          ) : users.length ? (
            users.map((user) => (
              <Box
                key={user.username}
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 0.75 }}
              >
                <Box>
                  <Typography variant="body2">{user.username} ({user.role})</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.email ?? "No recovery email"}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      setRecoveryEmailTarget(user);
                      setRecoveryEmail(user.email ?? "");
                      setUserMessage("");
                    }}
                  >
                    Recovery email
                  </Button>
                  {user.role !== "owner" && (
                    <Button
                      size="small"
                      startIcon={<LockResetRoundedIcon />}
                      onClick={() => {
                        setResetTarget(user.username);
                        setResetPassword("");
                        setUserMessage("");
                      }}
                    >
                      Reset password
                    </Button>
                  )}
                </Box>
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">No customer accounts yet.</Typography>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={recoveryEmailTarget !== null}
        onClose={() => !savingUser && setRecoveryEmailTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={handleUpdateRecoveryEmail}>
          <DialogTitle>Set recovery email</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Verify this email address with the account owner. Password reset codes will be sent there.
            </Typography>
            {userMessageIsError && <Alert severity="error" sx={{ mb: 1 }}>{userMessage}</Alert>}
            <TextField
              label="Recovery email"
              type="email"
              autoComplete="email"
              required
              fullWidth
              margin="dense"
              value={recoveryEmail}
              onChange={(event) => setRecoveryEmail(event.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setRecoveryEmailTarget(null)} disabled={savingUser}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingUser}>
              {savingUser ? "Saving..." : "Save recovery email"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={resetTarget !== null}
        onClose={() => !savingUser && setResetTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={handleResetPassword}>
          <DialogTitle>Reset customer password</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Set a new password for {resetTarget}. Their existing sessions will be revoked.
            </Typography>
            {userMessageIsError && <Alert severity="error" sx={{ mb: 1 }}>{userMessage}</Alert>}
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
              fullWidth
              margin="dense"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setResetTarget(null)} disabled={savingUser}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={savingUser}>
              {savingUser ? "Resetting..." : "Reset password"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={changePasswordOpen}
        onClose={() => !savingPassword && setChangePasswordOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={handleChangeOwnPassword}>
          <DialogTitle>Change your password</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              This is available for every account. Use your current password to confirm the change.
            </Typography>
            {passwordMessage && (
              <Alert severity={passwordMessageIsError ? "error" : "success"} sx={{ mb: 1 }}>
                {passwordMessage}
              </Alert>
            )}
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              fullWidth
              margin="dense"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              slotProps={{ htmlInput: { minLength: 10, maxLength: 128 } }}
              fullWidth
              margin="dense"
              value={newOwnPassword}
              onChange={(event) => setNewOwnPassword(event.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setChangePasswordOpen(false)} disabled={savingPassword}>
              Close
            </Button>
            <Button type="submit" variant="contained" disabled={savingPassword}>
              {savingPassword ? "Saving..." : "Change password"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
};

export default Header;
