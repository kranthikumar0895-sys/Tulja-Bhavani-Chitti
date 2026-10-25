import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "./auth";
import { API_BASE_URL, api } from "./chittiApi";

interface AuthResponse {
  access_token: string;
  username: string;
}

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign in is the default page.
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [authNotice, setAuthNotice] = useState(() => {
    const notice = sessionStorage.getItem("auth_message") ?? "";
    sessionStorage.removeItem("auth_message");
    return notice;
  });

  const [successMessage, setSuccessMessage] = useState("");

  // Forgot-password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const navigate = useNavigate();

  // Sign in or create an account.
  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setAuthNotice("");
    setSuccessMessage("");
    setSubmitting(true);

    try {
      const endpoint = isCreatingAccount ? "register" : "login";

      const response = await api.post<AuthResponse>(
        `/auth/${endpoint}`,
        {
          username: username.trim(),
          password,
          ...(isCreatingAccount ? { email: email.trim() } : {}),
        }
      );

      localStorage.setItem("access_token", response.data.access_token);
      localStorage.setItem("user", response.data.username);

      navigate("/", { replace: true });
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          isCreatingAccount
            ? "Could not create your account. Please try again."
            : "Could not sign in. Please check your username and password."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Request a password-reset code.
  const handleRequestResetCode = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setResetSubmitting(true);
    setResetError("");
    setResetMessage("");

    try {
      const response = await api.post<{ message: string }>(
        "/auth/password-reset/request",
        {
          username: resetUsername.trim(),
        }
      );

      setResetCodeSent(true);
      setResetMessage(response.data.message);
    } catch (requestError) {
      setResetError(
        getApiErrorMessage(
          requestError,
          `Cannot reach the API at ${API_BASE_URL}. Check that the API URL is correct.`
        )
      );
    } finally {
      setResetSubmitting(false);
    }
  };

  // Confirm the password reset.
  const handleConfirmReset = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setResetSubmitting(true);
    setResetError("");
    setResetMessage("");

    try {
      const response = await api.post<{ message: string }>(
        "/auth/password-reset/confirm",
        {
          username: resetUsername.trim(),
          code: resetCode.trim(),
          new_password: resetPassword,
        }
      );

      setUsername(resetUsername.trim());
      setPassword("");
      setShowForgotPassword(false);
      setResetCodeSent(false);
      setResetCode("");
      setResetPassword("");
      setResetMessage(response.data.message);
      setSuccessMessage(response.data.message);
      setError("");
    } catch (requestError) {
      setResetError(
        getApiErrorMessage(
          requestError,
          "Could not reset the password."
        )
      );
    } finally {
      setResetSubmitting(false);
    }
  };

  // Return to the normal sign-in page.
  const handleBackToLogin = () => {
    setIsCreatingAccount(false);
    setShowForgotPassword(false);
    setResetCodeSent(false);
    setResetCode("");
    setResetPassword("");
    setResetError("");
    setResetMessage("");
    setError("");
    setAuthNotice("");
    setSuccessMessage("");
  };

  return (
    <Box className="login-page">
      <Card className="login-card" elevation={0}>
        <CardContent className="login-card-content">
          <Box className="login-brand-mark">C</Box>

          <Typography className="login-brand-name">
            Tulja Bhavani Chitti
          </Typography>

          {showForgotPassword ? (
            <Box className="recovery-panel">
              <Box className="login-heading-icon">
                <LockResetRoundedIcon />
              </Box>

              <Typography variant="h5" className="login-title">
                Forgot your password?
              </Typography>

              <Typography
                color="text.secondary"
                className="login-description"
              >
                {resetCodeSent
                  ? "Enter the six-digit code sent to your account's recovery email."
                  : "Get a one-time code by email to reset your password."}
              </Typography>

              {resetMessage && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  {resetMessage}
                </Alert>
              )}

              {resetError && (
                <Alert severity="error" sx={{ mb: 1.5 }}>
                  {resetError}
                </Alert>
              )}

              {!resetCodeSent ? (
                <Box
                  component="form"
                  onSubmit={handleRequestResetCode}
                  className="login-form"
                >
                  <TextField
                    label="Username"
                    autoComplete="username"
                    required
                    fullWidth
                    margin="normal"
                    value={resetUsername}
                    onChange={(event) =>
                      setResetUsername(event.target.value)
                    }
                  />

                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    disabled={resetSubmitting}
                  >
                    {resetSubmitting
                      ? "Sending code..."
                      : "Send reset code"}
                  </Button>
                </Box>
              ) : (
                <Box
                  component="form"
                  onSubmit={handleConfirmReset}
                  className="login-form"
                >
                  <TextField
                    label="Six-digit code"
                    autoComplete="one-time-code"
                    required
                    fullWidth
                    margin="normal"
                    value={resetCode}
                    onChange={(event) =>
                      setResetCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    slotProps={{
                      htmlInput: {
                        inputMode: "numeric",
                        maxLength: 6,
                      },
                    }}
                  />

                  <TextField
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    required
                    fullWidth
                    margin="normal"
                    value={resetPassword}
                    onChange={(event) =>
                      setResetPassword(event.target.value)
                    }
                    slotProps={{
                      htmlInput: {
                        minLength: 10,
                        maxLength: 128,
                      },
                    }}
                  />

                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    disabled={
                      resetSubmitting ||
                      resetCode.length !== 6 ||
                      resetPassword.length < 10
                    }
                  >
                    {resetSubmitting
                      ? "Resetting password..."
                      : "Reset password"}
                  </Button>
                </Box>
              )}

              <Button
                fullWidth
                variant="text"
                startIcon={<ArrowBackRoundedIcon />}
                onClick={handleBackToLogin}
                sx={{ mt: 1 }}
              >
                Return to sign in
              </Button>
            </Box>
          ) : (
            <Box
              component="form"
              onSubmit={handleSubmit}
              className="login-form"
            >
              <Box className="login-heading-icon">
                <LockOpenRoundedIcon />
              </Box>

              <Typography variant="h5" className="login-title">
                {isCreatingAccount
                  ? "Create your account"
                  : "Welcome back"}
              </Typography>

              <Typography
                color="text.secondary"
                className="login-description"
              >
                {isCreatingAccount
                  ? "Set up your account to get started."
                  : "Sign in to manage your chitti groups."}
              </Typography>

              {authNotice && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  {authNotice}
                </Alert>
              )}

              {error && (
                <Alert severity="error" sx={{ mb: 1.5 }}>
                  {error}
                </Alert>
              )}

              {successMessage && (
                <Alert
                  severity="success"
                  sx={{ mb: 1.5 }}
                  onClose={() => setSuccessMessage("")}
                >
                  {successMessage}
                </Alert>
              )}

              <TextField
                label="Username"
                autoComplete="username"
                required
                fullWidth
                margin="normal"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                slotProps={{
                  htmlInput: {
                    minLength: 3,
                  },
                }}
              />

              {isCreatingAccount && (
                <TextField
                  label="Recovery email"
                  type="email"
                  autoComplete="email"
                  required
                  fullWidth
                  margin="normal"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                />
              )}

              <TextField
                label="Password"
                type="password"
                autoComplete={
                  isCreatingAccount
                    ? "new-password"
                    : "current-password"
                }
                required
                fullWidth
                margin="normal"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                slotProps={{
                  htmlInput: {
                    minLength: isCreatingAccount ? 10 : undefined,
                    maxLength: 128,
                  },
                }}
              />

              {!isCreatingAccount && (
                <Box className="forgot-password-row">
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => {
                      setError("");
                      setSuccessMessage("");
                      setShowForgotPassword(true);
                    }}
                  >
                    Forgot password?
                  </Button>
                </Box>
              )}

              <Button
                type="submit"
                variant="contained"
                color="secondary"
                fullWidth
                className="login-submit"
                disabled={submitting}
              >
                {submitting ? (
                  <CircularProgress size={22} color="inherit" />
                ) : isCreatingAccount ? (
                  "Create account"
                ) : (
                  "Sign in"
                )}
              </Button>

              <Divider sx={{ mt: 3, mb: 2 }} />

              {!isCreatingAccount ? (
                <>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                    sx={{ mb: 1,
                        textAlign: "center",}}
                  >
                    Don't have an account?
                  </Typography>

                  <Button
                    type="button"
                    variant="outlined"
                    fullWidth
                    onClick={() => {
                      setError("");
                      setAuthNotice("");
                      setSuccessMessage("");
                      setEmail("");
                      setPassword("");
                      setIsCreatingAccount(true);
                    }}
                  >
                    Create your account
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="text"
                  fullWidth
                  startIcon={<ArrowBackRoundedIcon />}
                  onClick={handleBackToLogin}
                >
                  Back to sign in
                </Button>
              )}

              <Typography
                variant="caption"
                color="text.secondary"
                className="login-footer"
                sx={{ display: "block", mt: 3, textAlign: "center" }}
              >
                Securely manage your chitti, members, and monthly collections.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
