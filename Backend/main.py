from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from contextlib import contextmanager
from pydantic import BaseModel, Field
from typing import Iterator, List, Optional
from pathlib import Path
from datetime import datetime, timezone
from email.message import EmailMessage
from io import BytesIO
import hashlib
import hmac
import logging
import pandas as pd
import os
import re
import secrets
import smtplib
import ssl
import sqlite3
import time

app = FastAPI(title="Chit Fund Management API")
logger = logging.getLogger(__name__)

allowed_origins = {
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "CHITTI_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")
    if origin.strip()
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Data Schemas ---
class CreateChittiRequest(BaseModel):
    chitti_name: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0)
    members: List[str] = Field(min_length=1, max_length=200)
    months: int = Field(default=24, ge=1, le=60)

class UpdateChittiRequest(BaseModel):
    amount: float = Field(gt=0)
    months: int = Field(ge=1, le=60)

class PaymentToggleRequest(BaseModel):
    chitti_name: str = Field(min_length=1, max_length=100)
    month: int = Field(ge=1, le=60)
    member_name: str = Field(min_length=1, max_length=100)
    has_paid: bool

class GroupMonthRequest(BaseModel):
    month: int = Field(ge=1, le=60)

class PaymentUpdateRequest(BaseModel):
    member_id: int
    month: int = Field(ge=1, le=60)
    has_paid: Optional[bool] = None
    amount_paid: Optional[float] = Field(default=None, ge=0)

class MonthlyCommentRequest(BaseModel):
    member_id: int
    month: int = Field(ge=1, le=60)
    comment: str = Field(max_length=2000)

class CustomAmountRequest(BaseModel):
    member_id: int
    month: int = Field(ge=1, le=60)
    custom_amount: float = Field(ge=0)

class MemberRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

AUTH_DB_PATH = Path(
    os.environ.get("CHITTI_AUTH_DB_PATH", Path(__file__).with_name("chitti_auth.db"))
)
OWNER_USERNAME = os.environ.get(
    "CHITTI_OWNER_USERNAME", "kranthikumar0895@gmail.com"
).strip().casefold()
TOKEN_TTL_SECONDS = 12 * 60 * 60
PASSWORD_ITERATIONS = 600_000
RESET_CODE_ITERATIONS = 200_000
RESET_CODE_TTL_SECONDS = 10 * 60
RESET_CODE_RESEND_SECONDS = 60
RESET_CODE_MAX_ATTEMPTS = 5
bearer_scheme = HTTPBearer(auto_error=False)


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=10, max_length=128)
    email: Optional[str] = Field(default=None, max_length=254)

class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=10, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)

class PasswordResetRequestCode(BaseModel):
    username: str = Field(min_length=3, max_length=64)

class RecoveryEmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class PasswordResetWithCode(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=10, max_length=128)

class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=10, max_length=128)


@contextmanager
def get_auth_db() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(AUTH_DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_auth_db():
    with get_auth_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at INTEGER NOT NULL,
                role TEXT NOT NULL DEFAULT 'customer'
            )
            """
        )
        user_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(users)").fetchall()
        }
        if "role" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'"
            )
        if "email" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN email TEXT")
            connection.execute(
                """
                UPDATE users
                SET email = lower(trim(username))
                WHERE instr(username, '@') > 1
                  AND instr(substr(username, instr(username, '@') + 1), '.') > 1
                """
            )
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
            ON users(email COLLATE NOCASE)
            WHERE email IS NOT NULL
            """
        )
        for user in connection.execute("SELECT id, username FROM users").fetchall():
            role = (
                "owner"
                if user["username"].strip().casefold() == OWNER_USERNAME
                else "customer"
            )
            connection.execute("UPDATE users SET role = ? WHERE id = ?", (role, user["id"]))
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chitti_groups (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                total_amount REAL NOT NULL CHECK (total_amount > 0),
                months INTEGER NOT NULL CHECK (months BETWEEN 1 AND 60),
                current_month INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chitti_members (
                id INTEGER PRIMARY KEY,
                group_id INTEGER NOT NULL REFERENCES chitti_groups(id) ON DELETE CASCADE,
                name TEXT NOT NULL COLLATE NOCASE,
                UNIQUE (group_id, name)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chitti_payments (
                member_id INTEGER NOT NULL REFERENCES chitti_members(id) ON DELETE CASCADE,
                month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 60),
                has_paid INTEGER NOT NULL DEFAULT 0,
                paid_at TEXT,
                custom_amount REAL NOT NULL DEFAULT 0 CHECK (custom_amount >= 0),
                PRIMARY KEY (member_id, month)
            )
            """
        )
        payment_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(chitti_payments)").fetchall()
        }
        if "custom_amount" not in payment_columns:
            connection.execute(
                "ALTER TABLE chitti_payments ADD COLUMN custom_amount REAL NOT NULL DEFAULT 0"
            )
        if "amount_paid" not in payment_columns:
            connection.execute(
                "ALTER TABLE chitti_payments ADD COLUMN amount_paid REAL NOT NULL DEFAULT 0"
            )
            connection.execute(
                """
                UPDATE chitti_payments AS payments
                SET amount_paid = (
                    SELECT (chitti_groups.total_amount / chitti_groups.months) + payments.custom_amount
                    FROM chitti_members AS members
                    JOIN chitti_groups ON chitti_groups.id = members.group_id
                    WHERE members.id = payments.member_id
                )
                WHERE has_paid = 1
                """
            )
        if "monthly_comment" not in payment_columns:
            connection.execute(
                "ALTER TABLE chitti_payments ADD COLUMN monthly_comment TEXT NOT NULL DEFAULT ''"
            )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                code_salt BLOB NOT NULL,
                code_hash BLOB NOT NULL,
                expires_at INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            )
            """
        )


initialize_auth_db()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


def normalize_username(username: str) -> str:
    return username.strip().casefold()


def hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS
    )


def create_user(
    connection: sqlite3.Connection,
    username: str,
    password: str,
    role: str = "customer",
    email: Optional[str] = None,
):
    normalized_username = normalize_username(username)
    if len(normalized_username) < 3:
        raise HTTPException(status_code=422, detail="Username must have at least 3 characters")
    normalized_email = normalize_email(email or normalized_username)

    salt = secrets.token_bytes(16)
    connection.execute(
        "INSERT INTO users (username, password_salt, password_hash, created_at, role, email) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            normalized_username,
            salt,
            hash_password(password, salt),
            int(time.time()),
            role,
            normalized_email,
        ),
    )


def normalize_email(email: str) -> str:
    normalized_email = email.strip().casefold()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized_email):
        raise HTTPException(status_code=422, detail="Enter a valid recovery email address")
    return normalized_email


def send_password_reset_email(recipient: str, code: str) -> None:
    """
    Send a password reset code to the user's recovery email.

    SMTP configuration comes from Render environment variables:
        CHITTI_SMTP_HOST
        CHITTI_SMTP_PORT
        CHITTI_SMTP_FROM
        CHITTI_SMTP_USERNAME
        CHITTI_SMTP_PASSWORD
        CHITTI_SMTP_USE_SSL
    """

    host = os.environ.get("CHITTI_SMTP_HOST", "").strip()
    sender = os.environ.get("CHITTI_SMTP_FROM", "").strip()

    # ---------------------------------------------------------
    # 1. Check basic SMTP configuration
    # ---------------------------------------------------------

    if not host:
        logger.error("CHITTI_SMTP_HOST is missing")

        raise HTTPException(
            status_code=503,
            detail="SMTP host is not configured.",
        )

    if not sender:
        logger.error("CHITTI_SMTP_FROM is missing")

        raise HTTPException(
            status_code=503,
            detail="SMTP sender email is not configured.",
        )

    # ---------------------------------------------------------
    # 2. Read SMTP port
    # ---------------------------------------------------------
    try:
        port = int(
            os.environ.get(
                "CHITTI_SMTP_PORT",
                "587",
            )
        )
    except ValueError as error:
        logger.exception("Invalid SMTP port")
        raise HTTPException(
            status_code=503,
            detail="The configured SMTP port is invalid.",
        ) from error

    # ---------------------------------------------------------
    # 3. Read SMTP username/password
    # ---------------------------------------------------------
    username = os.environ.get(
        "CHITTI_SMTP_USERNAME",
        "",
    ).strip()
    password = os.environ.get(
        "CHITTI_SMTP_PASSWORD",
        "",
    )
    use_ssl = (
        os.environ.get(
            "CHITTI_SMTP_USE_SSL",
            "false",
        )
        .strip()
        .casefold()
        == "true"
    )
    # Username and password must either both exist or both be empty.
    if bool(username) != bool(password):
        logger.error(
            "SMTP username/password configuration is incomplete"
        )
        raise HTTPException(
            status_code=503,
            detail="Both SMTP username and password must be configured together.",
        )
    # ---------------------------------------------------------
    # 4. Create email
    # ---------------------------------------------------------

    message = EmailMessage()
    message["Subject"] = "Your Chitti password reset code"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        f"""
Hello,
Your Tulja Bhavani Chitti password reset code is:
{code}
This code expires in 10 minutes and can only be used once.
If you did not request a password reset, please ignore this email.
Regards,
Tulja Bhavani Chitti
""".strip()
    )

    # ---------------------------------------------------------
    # 5. Connect to SMTP server and send email
    # ---------------------------------------------------------

    try:

        logger.info(
            "Starting password reset email delivery"
        )

        logger.info(
            "SMTP host: %s",
            host,
        )

        logger.info(
            "SMTP port: %s",
            port,
        )

        logger.info(
            "SMTP SSL: %s",
            use_ssl,
        )

        logger.info(
            "SMTP sender: %s",
            sender,
        )
        logger.info(
            "Password reset recipient: %s",
            recipient,
        )
        # IMPORTANT:
        # Do NOT log the actual SMTP password.
        logger.info(
            "SMTP username configured: %s",
            bool(username),
        )
        logger.info(
            "SMTP password configured: %s",
            bool(password),
        )
        # -----------------------------------------------------
        # SSL connection
        # -----------------------------------------------------
        if use_ssl:
            logger.info(
                "Connecting using SMTP_SSL..."
            )
            with smtplib.SMTP_SSL(
                host,
                port,
                timeout=20,
                context=ssl.create_default_context(),
            ) as server:
                logger.info(
                    "SMTP_SSL connection established"
                )
                if username:
                    logger.info(
                        "Authenticating with SMTP server..."
                    )
                    server.login(
                        username,
                        password,
                    )
                    logger.info(
                        "SMTP authentication successful"
                    )
                logger.info(
                    "Sending password reset email..."
                )
                server.send_message(message)
                logger.info(
                    "Password reset email sent successfully to %s",
                    recipient,
                )
        # -----------------------------------------------------
        # STARTTLS connection
        # -----------------------------------------------------
        else:
            logger.info(
                "Connecting using SMTP + STARTTLS..."
            )
            with smtplib.SMTP(
                host,
                port,
                timeout=20,
            ) as server:
                logger.info(
                    "SMTP connection established"
                )

                server.ehlo()
                logger.info(
                    "Starting TLS..."
                )
                server.starttls(
                    context=ssl.create_default_context()
                )
                server.ehlo()
                logger.info(
                    "TLS connection established"
                )
                if username:
                    logger.info(
                        "Authenticating with SMTP server..."
                    )
                    server.login(
                        username,
                        password,
                    )
                    logger.info(
                        "SMTP authentication successful"
                    )
                logger.info(
                    "Sending password reset email..."
                )
                server.send_message(message)
                logger.info(
                    "Password reset email sent successfully to %s",
                    recipient,
                )
    # ---------------------------------------------------------
    # 6. Handle SMTP errors
    # ---------------------------------------------------------
    except smtplib.SMTPAuthenticationError:
        logger.exception(
            "SMTP authentication failed. Check CHITTI_SMTP_USERNAME and CHITTI_SMTP_PASSWORD."
        )
        raise HTTPException(
            status_code=503,
            detail="Email server authentication failed. Check the SMTP username and App Password.",
        )
    except smtplib.SMTPConnectError:
        logger.exception(
            "Could not connect to SMTP server."
        )
        raise HTTPException(
            status_code=503,
            detail="Could not connect to the email server.",
        )
    except smtplib.SMTPServerDisconnected:
        logger.exception(
            "SMTP server disconnected the connection."
        )
        raise HTTPException(
            status_code=503,
            detail="The email server disconnected the connection.",
        )
    except smtplib.SMTPException:
        logger.exception(
            "SMTP error while sending password reset email."
        )
        raise HTTPException(
            status_code=503,
            detail="Could not send the password reset email.",
        )
    except OSError:
        logger.exception(
            "Network error while connecting to SMTP server."
        )
        raise HTTPException(
            status_code=503,
            detail="Could not connect to the email server.",
        )


def issue_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    with get_auth_db() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hashlib.sha256(token.encode("utf-8")).hexdigest(), user_id, expires_at),
        )
    return token


def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in is required")

    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    now = int(time.time())
    with get_auth_db() as connection:
        row = connection.execute(
            """
            SELECT users.username FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (token_hash, now),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=401, detail="Session is invalid or expired")
    return row["username"]


def require_owner(current_user: str = Depends(require_user)) -> str:
    with get_auth_db() as connection:
        row = connection.execute(
            "SELECT role FROM users WHERE username = ?", (current_user,)
        ).fetchone()
    if row is None or row["role"] != "owner":
        raise HTTPException(status_code=403, detail="Owner access is required")
    return current_user


@app.get("/api/auth/status")
def auth_status():
    with get_auth_db() as connection:
        has_users = connection.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None
    return {"needs_initial_setup": not has_users}


@app.post("/api/auth/register")
def register_first_user(data: Credentials):
    try:
        with get_auth_db() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None:
                raise HTTPException(status_code=403, detail="Initial setup is already complete")
            normalized_username = normalize_username(data.username)
            role = "owner" if normalized_username == OWNER_USERNAME else "customer"
            create_user(
                connection, data.username, data.password, role, data.email
            )
            user_id = connection.execute(
                "SELECT id FROM users WHERE username = ?",
                (normalized_username,),
            ).fetchone()["id"]
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=409,
            detail="Username or recovery email is already in use",
        ) from error

    return {
        "access_token": issue_session(user_id),
        "token_type": "bearer",
        "username": normalize_username(data.username),
        "role": role,
    }


@app.post("/api/auth/login")
def login(data: Credentials):
    with get_auth_db() as connection:
        user = connection.execute(
            """
            SELECT id, password_salt, password_hash, role
            FROM users WHERE username = ? COLLATE NOCASE
            """,
            (normalize_username(data.username),),
        ).fetchone()

    if user is None or not hmac.compare_digest(
        hash_password(data.password, user["password_salt"]), user["password_hash"]
    ):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    return {
        "access_token": issue_session(user["id"]),
        "token_type": "bearer",
        "username": normalize_username(data.username),
        "role": user["role"],
    }


@app.post("/api/auth/password-reset/request")

def request_password_reset(data: PasswordResetRequestCode):
    print("PASSWORD RESET FUNCTION ENTERED", flush=True)
    logger.info("DEBUG: password reset endpoint entered")
    response = {
        "status": "success",
        "message": (
            "If an account matches, a reset code will be sent "
            "to its recovery email."
        ),
    }
    normalized_username = normalize_username(data.username)
    with get_auth_db() as connection:
        user = connection.execute(
            """
            SELECT id, email
            FROM users
            WHERE username = ? COLLATE NOCASE
            """,
            (normalized_username,),
        ).fetchone()
        # Do not reveal whether the username exists.
        if user is None:
            logger.info(
                "Password reset skipped: account not found."
            )
            return response
        if not user["email"]:
            logger.info(
                "Password reset skipped: no recovery email is configured."
            )
            return response
        logger.warning("DEBUG: Account found and recovery email exists")
        now = int(time.time())
        previous_request = connection.execute(
            """
            SELECT created_at
            FROM password_reset_codes
            WHERE user_id = ?
            """,
            (user["id"],),
        ).fetchone()
        # Prevent requesting another code too quickly.
        if (
            previous_request is not None
            and now - previous_request["created_at"]
            < RESET_CODE_RESEND_SECONDS
        ):
            logger.info(
                "Password reset skipped: resend cooldown is active."
            )
            return response
        # Generate a six-digit reset code.
        code = f"{secrets.randbelow(1_000_000):06d}"
        salt = secrets.token_bytes(16)
        code_hash = hashlib.pbkdf2_hmac(
            "sha256",
            code.encode("ascii"),
            salt,
            RESET_CODE_ITERATIONS,
        )
        # Save the hashed code in the database.
        connection.execute(
            """
            INSERT INTO password_reset_codes
                (
                    user_id,
                    code_salt,
                    code_hash,
                    expires_at,
                    attempts,
                    created_at
                )
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                code_salt = excluded.code_salt,
                code_hash = excluded.code_hash,
                expires_at = excluded.expires_at,
                attempts = 0,
                created_at = excluded.created_at
            """,
            (
                user["id"],
                salt,
                code_hash,
                now + RESET_CODE_TTL_SECONDS,
                now,
            ),
        )
        # Save the values needed after closing the database connection.
        user_id = user["id"]
        recipient_email = user["email"]
    # Send the email after the database connection is closed.
    # Never log the reset code or SMTP password.
    logger.info("Password reset email sending attempt started.")
    try:
        send_password_reset_email(
            recipient_email,
            code,
        )
        logger.info(
            "Password reset email function completed successfully."
        )
    except HTTPException:
        logger.exception(
            "Password reset email sending failed."
        )
        # Remove the reset code because the email was not sent successfully.
        with get_auth_db() as connection:
            connection.execute(
                """
                DELETE FROM password_reset_codes
                WHERE user_id = ?
                """,
                (user_id,),
            )
        raise
    return response


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset(data: PasswordResetWithCode):
    if not re.fullmatch(r"\d{6}", data.code):
        raise HTTPException(status_code=400, detail="The reset code is invalid or expired.")

    valid_code = False
    normalized_username = normalize_username(data.username)
    with get_auth_db() as connection:
        user = connection.execute(
            "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
            (normalized_username,),
        ).fetchone()
        reset = (
            connection.execute(
                """
                SELECT code_salt, code_hash, expires_at, attempts
                FROM password_reset_codes WHERE user_id = ?
                """,
                (user["id"],),
            ).fetchone()
            if user is not None
            else None
        )
        now = int(time.time())
        if (
            reset is not None
            and reset["expires_at"] > now
            and reset["attempts"] < RESET_CODE_MAX_ATTEMPTS
        ):
            connection.execute(
                "UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ?",
                (user["id"],),
            )
            submitted_hash = hashlib.pbkdf2_hmac(
                "sha256",
                data.code.encode("ascii"),
                reset["code_salt"],
                RESET_CODE_ITERATIONS,
            )
            valid_code = hmac.compare_digest(submitted_hash, reset["code_hash"])
            if valid_code:
                new_salt = secrets.token_bytes(16)
                connection.execute(
                    "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
                    (
                        new_salt,
                        hash_password(data.new_password, new_salt),
                        user["id"],
                    ),
                )
                connection.execute(
                    "DELETE FROM sessions WHERE user_id = ?", (user["id"],)
                )
                connection.execute(
                    "DELETE FROM password_reset_codes WHERE user_id = ?",
                    (user["id"],),
                )

    if not valid_code:
        raise HTTPException(status_code=400, detail="The reset code is invalid or expired.")
    return {"status": "success", "message": "Your password has been reset. Please sign in."}


@app.put("/api/auth/change-password")
def change_own_password(
    data: PasswordChangeRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    current_user: str = Depends(require_user),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in is required")
    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    with get_auth_db() as connection:
        user = connection.execute(
            "SELECT id, password_salt, password_hash FROM users WHERE username = ?",
            (current_user,),
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=401, detail="Account no longer exists")
        if not hmac.compare_digest(
            hash_password(data.current_password, user["password_salt"]),
            user["password_hash"],
        ):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        salt = secrets.token_bytes(16)
        connection.execute(
            "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
            (salt, hash_password(data.new_password, salt), user["id"]),
        )
        connection.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user["id"], token_hash),
        )
    return {"status": "success"}


@app.post("/api/auth/users", status_code=201)
def add_user(data: Credentials, current_user: str = Depends(require_owner)):
    try:
        with get_auth_db() as connection:
            create_user(
                connection,
                data.username,
                data.password,
                email=data.email,
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=409,
            detail="Username or recovery email is already in use",
        ) from error
    return {"username": normalize_username(data.username)}


@app.get("/api/auth/me")
def current_account(current_user: str = Depends(require_user)):
    with get_auth_db() as connection:
        user = connection.execute(
            "SELECT username, role FROM users WHERE username = ?", (current_user,)
        ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return {"username": user["username"], "role": user["role"]}


@app.get("/api/auth/users")
def list_users(current_user: str = Depends(require_owner)):
    with get_auth_db() as connection:
        users = connection.execute(
            "SELECT username, role, email FROM users ORDER BY username"
        ).fetchall()
    return [dict(user) for user in users]


@app.put("/api/auth/users/{username}/email")
def update_user_recovery_email(
    username: str,
    data: RecoveryEmailRequest,
    current_user: str = Depends(require_owner),
):
    normalized_username = normalize_username(username)
    normalized_email = normalize_email(data.email)
    try:
        with get_auth_db() as connection:
            user = connection.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
                (normalized_username,),
            ).fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="User account not found")
            connection.execute(
                "UPDATE users SET email = ? WHERE id = ?",
                (normalized_email, user["id"]),
            )
            connection.execute(
                "DELETE FROM password_reset_codes WHERE user_id = ?", (user["id"],)
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=409, detail="That recovery email is already assigned to an account"
        ) from error
    return {"username": normalized_username, "email": normalized_email}


@app.put("/api/auth/users/{username}/password")
def reset_user_password(
    username: str,
    data: PasswordResetRequest,
    current_user: str = Depends(require_owner),
):
    normalized_username = normalize_username(username)
    if normalized_username == current_user:
        raise HTTPException(status_code=400, detail="Use a separate account to reset another user's password")
    salt = secrets.token_bytes(16)
    with get_auth_db() as connection:
        user = connection.execute(
            "SELECT id, role FROM users WHERE username = ? COLLATE NOCASE",
            (normalized_username,),
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User account not found")
        if user["role"] == "owner":
            raise HTTPException(status_code=403, detail="Owner password cannot be reset through customer management")
        connection.execute(
            "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
            (salt, hash_password(data.password, salt), user["id"]),
        )
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
    return {"status": "success", "username": normalized_username}


@app.post("/api/auth/logout")
def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    current_user: str = Depends(require_user),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in is required")
    token_hash = hashlib.sha256(credentials.credentials.encode("utf-8")).hexdigest()
    with get_auth_db() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
    return {"status": "success"}


def normalize_member_names(names: List[str]) -> List[str]:
    cleaned = [name.strip() for name in names]
    if any(not name for name in cleaned):
        raise HTTPException(status_code=422, detail="Member names cannot be blank")
    if len({name.casefold() for name in cleaned}) != len(cleaned):
        raise HTTPException(status_code=422, detail="Member names must be unique within a group")
    return cleaned


def installment_values(total_amount: float, months: int) -> dict:
    monthly_value = total_amount / months
    commission = monthly_value * 0.05
    amount_after_commission = monthly_value - commission
    return {
        "monthly_installment": monthly_value,
        "commission": commission,
        "amount_after_commission": amount_after_commission,
        "payable": commission + amount_after_commission,
    }


def outstanding_month_balances(
    payments: dict[int, sqlite3.Row],
    through_month: int,
    monthly_payable: float,
) -> list[float]:
    remaining_payment = sum(
        payments[month]["amount_paid"]
        for month in range(1, through_month + 1)
        if month in payments
    )
    balances = []
    for month in range(1, through_month + 1):
        payment = payments.get(month)
        custom_amount = payment["custom_amount"] if payment else 0
        amount_due = round(monthly_payable + custom_amount, 2)
        applied = min(amount_due, remaining_payment)
        remaining_payment -= applied
        balances.append(round(amount_due - applied, 2))
    return balances


def create_excel_download(chitti_name: str, rows: list) -> StreamingResponse:
    output = BytesIO()
    pd.DataFrame(rows).to_excel(output, index=False)
    output.seek(0)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", chitti_name).strip("._") or "chitti"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_Export.xlsx"'},
    )


def get_group_or_404(connection: sqlite3.Connection, group_id: int) -> sqlite3.Row:
    group = connection.execute(
        "SELECT * FROM chitti_groups WHERE id = ?", (group_id,)
    ).fetchone()
    if group is None:
        raise HTTPException(status_code=404, detail="Chitti group not found")
    return group


def serialize_group(
    connection: sqlite3.Connection, group: sqlite3.Row, month: Optional[int] = None
) -> dict:
    selected_month = month if month is not None else group["current_month"]
    values = installment_values(group["total_amount"], group["months"])
    members = connection.execute(
        """
        SELECT members.id, members.name,
               COALESCE(payments.amount_paid, 0) AS amount_paid,
               payments.paid_at,
               COALESCE(payments.custom_amount, 0) AS custom_amount,
               COALESCE(payments.monthly_comment, '') AS monthly_comment
        FROM chitti_members AS members
        LEFT JOIN chitti_payments AS payments
          ON payments.member_id = members.id AND payments.month = ?
        WHERE members.group_id = ?
        ORDER BY members.id
        """,
        (selected_month, group["id"]),
    ).fetchall()
    all_payments = connection.execute(
        """
        SELECT payments.member_id, payments.month, payments.amount_paid,
               payments.custom_amount
        FROM chitti_payments AS payments
        JOIN chitti_members AS members ON members.id = payments.member_id
        WHERE members.group_id = ? AND payments.month <= ?
        ORDER BY payments.member_id, payments.month
        """,
        (group["id"], selected_month),
    ).fetchall()
    payments_by_member: dict[int, dict[int, sqlite3.Row]] = {}
    for payment in all_payments:
        payments_by_member.setdefault(payment["member_id"], {})[payment["month"]] = payment

    serialized_members = []
    total_collected = 0
    total_pending = 0
    paid_count = 0
    for member in members:
        member_payments = payments_by_member.get(member["id"], {})
        balances = outstanding_month_balances(
            member_payments, selected_month, values["payable"]
        )
        prior_month_due = round(sum(balances[:-1]), 2)
        current_month_due = balances[-1]
        due_amount = round(prior_month_due + current_month_due, 2)
        is_paid = current_month_due <= 0
        amount_paid = member["amount_paid"]
        paid_count += int(is_paid)
        total_collected += amount_paid
        total_pending += due_amount
        serialized_members.append(
            {
                "id": member["id"],
                "name": member["name"],
                "has_paid": is_paid,
                "paid_at": member["paid_at"],
                "amount_paid": amount_paid,
                "custom_amount": member["custom_amount"],
                "payable": round(values["payable"] + member["custom_amount"], 2),
                "prior_month_due": prior_month_due,
                "due_amount": due_amount,
                "monthly_comment": member["monthly_comment"],
            }
        )
    pending_count = len(members) - paid_count
    return {
        "id": group["id"],
        "chitti_name": group["name"],
        "total_amount": group["total_amount"],
        "months": group["months"],
        "monthly_installment": values["monthly_installment"],
        "commission": values["commission"],
        "amount_after_commission": values["amount_after_commission"],
        "payable_per_member": values["payable"],
        "current_month": group["current_month"],
        "selected_month": selected_month,
        "total_members": len(members),
        "paid_count": paid_count,
        "pending_count": pending_count,
        "total_collected": round(total_collected, 2),
        "total_pending": round(total_pending, 2),
        "members": serialized_members,
    }


@app.post("/api/chitti/create")
def create_chitti(data: CreateChittiRequest, current_user: str = Depends(require_user)):
    group_name = data.chitti_name.strip()
    if not group_name:
        raise HTTPException(status_code=422, detail="Chitti name cannot be blank")
    members = normalize_member_names(data.members)
    try:
        with get_auth_db() as connection:
            cursor = connection.execute(
                """
                INSERT INTO chitti_groups (name, total_amount, months, current_month, created_at)
                VALUES (?, ?, ?, 1, ?)
                """,
                (group_name, data.amount, data.months, datetime.now(timezone.utc).isoformat()),
            )
            group_id = cursor.lastrowid
            connection.executemany(
                "INSERT INTO chitti_members (group_id, name) VALUES (?, ?)",
                [(group_id, member) for member in members],
            )
            group = get_group_or_404(connection, group_id)
            result = serialize_group(connection, group)
    except sqlite3.IntegrityError as error:
        if "chitti_groups.name" in str(error).lower():
            raise HTTPException(status_code=409, detail="A chitti with this name already exists") from error
        raise
    return {"status": "success", "message": f"Chitti '{group_name}' created successfully!", "group": result}


@app.get("/api/chitti")
def list_chittis(current_user: str = Depends(require_user)):
    with get_auth_db() as connection:
        groups = connection.execute(
            "SELECT * FROM chitti_groups ORDER BY created_at DESC, id DESC"
        ).fetchall()
        return [serialize_group(connection, group) for group in groups]


@app.get("/api/chitti/id/{group_id}")
def get_chitti_by_id(
    group_id: int,
    month: Optional[int] = Query(default=None, ge=1, le=60),
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        if month is not None and month > group["months"]:
            raise HTTPException(status_code=422, detail="Month is outside this chitti's schedule")
        return serialize_group(connection, group, month)


@app.put("/api/chitti/id/{group_id}")
def update_chitti(
    group_id: int,
    data: UpdateChittiRequest,
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        if data.months < group["months"]:
            later_payment = connection.execute(
                """
                SELECT 1 FROM chitti_payments AS payments
                JOIN chitti_members AS members ON members.id = payments.member_id
                WHERE members.group_id = ? AND payments.month > ?
                  AND (
                    payments.has_paid = 1
                    OR payments.amount_paid > 0
                    OR payments.custom_amount > 0
                  )
                LIMIT 1
                """,
                (group_id, data.months),
            ).fetchone()
            if later_payment is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot shorten this schedule: saved payments or custom amounts exist in later months.",
                )

        current_month = min(group["current_month"], data.months)
        connection.execute(
            "UPDATE chitti_groups SET total_amount = ?, months = ?, current_month = ? WHERE id = ?",
            (data.amount, data.months, current_month, group_id),
        )
        return serialize_group(connection, get_group_or_404(connection, group_id))


@app.put("/api/chitti/id/{group_id}/month")
def set_current_month(
    group_id: int,
    data: GroupMonthRequest,
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        if data.month > group["months"]:
            raise HTTPException(status_code=422, detail="Month is outside this chitti's schedule")
        connection.execute(
            "UPDATE chitti_groups SET current_month = ? WHERE id = ?",
            (data.month, group_id),
        )
        return serialize_group(connection, get_group_or_404(connection, group_id))


@app.put("/api/chitti/id/{group_id}/members/{member_id}")
def rename_member(
    group_id: int,
    member_id: int,
    data: MemberRequest,
    current_user: str = Depends(require_user),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Member name cannot be blank")
    try:
        with get_auth_db() as connection:
            get_group_or_404(connection, group_id)
            cursor = connection.execute(
                "UPDATE chitti_members SET name = ? WHERE id = ? AND group_id = ?",
                (name, member_id, group_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Member not found")
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="Member name already exists in this group") from error
    with get_auth_db() as connection:
        return serialize_group(connection, get_group_or_404(connection, group_id))


@app.post("/api/chitti/id/{group_id}/members", status_code=201)
def add_member(
    group_id: int,
    data: MemberRequest,
    current_user: str = Depends(require_user),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Member name cannot be blank")
    try:
        with get_auth_db() as connection:
            get_group_or_404(connection, group_id)
            cursor = connection.execute(
                "INSERT INTO chitti_members (group_id, name) VALUES (?, ?)",
                (group_id, name),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="Member name already exists in this group") from error
    return {"id": cursor.lastrowid, "name": name}


@app.get("/api/chitti/id/{group_id}/schedule")
def get_member_schedule(
    group_id: int,
    member_id: int,
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        member = connection.execute(
            "SELECT id, name FROM chitti_members WHERE id = ? AND group_id = ?",
            (member_id, group_id),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")
        values = installment_values(group["total_amount"], group["months"])
        payments = {
            row["month"]: row
            for row in connection.execute(
                """
                SELECT month, paid_at, custom_amount, amount_paid, monthly_comment
                FROM chitti_payments WHERE member_id = ?
                """,
                (member_id,),
            ).fetchall()
        }
        months = []
        for month in range(1, group["months"] + 1):
            payment = payments.get(month)
            custom_amount = payment["custom_amount"] if payment else 0
            amount_paid = payment["amount_paid"] if payment else 0
            outstanding_by_month = outstanding_month_balances(
                payments, month, values["payable"]
            )
            payable = round(values["payable"] + custom_amount, 2)
            month_due = outstanding_by_month[-1]
            prior_month_due = round(sum(outstanding_by_month[:-1]), 2)
            months.append({
                "month": month,
                **values,
                "custom_amount": custom_amount,
                "payable": payable,
                "amount_paid": amount_paid,
                "prior_month_due": round(prior_month_due, 2),
                "due_amount": round(prior_month_due + month_due, 2),
                "has_paid": month_due <= 0,
                "paid_at": payment["paid_at"] if payment else None,
                "monthly_comment": payment["monthly_comment"] if payment else "",
            })
        return {
            "group_id": group_id,
            "member_id": member["id"],
            "member_name": member["name"],
            "months": months,
        }


@app.put("/api/chitti/id/{group_id}/custom-amount")
def update_custom_amount(
    group_id: int,
    data: CustomAmountRequest,
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        if data.month > group["months"]:
            raise HTTPException(status_code=422, detail="Month is outside this chitti's schedule")
        member = connection.execute(
            "SELECT id FROM chitti_members WHERE id = ? AND group_id = ?",
            (data.member_id, group_id),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")
        connection.execute(
            """
            INSERT INTO chitti_payments (member_id, month, custom_amount)
            VALUES (?, ?, ?)
            ON CONFLICT(member_id, month)
            DO UPDATE SET custom_amount = excluded.custom_amount
            """,
            (data.member_id, data.month, data.custom_amount),
        )
        return {"custom_amount": data.custom_amount}


@app.get("/api/chitti/summary/{chitti_name}")
def get_chitti_summary(chitti_name: str, current_user: str = Depends(require_user)):
    with get_auth_db() as connection:
        group = connection.execute(
            "SELECT * FROM chitti_groups WHERE name = ? COLLATE NOCASE",
            (chitti_name,),
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="Chitti group not found")
        return serialize_group(connection, group)


@app.post("/api/chitti/id/{group_id}/payments")
def update_payment(
    group_id: int,
    data: PaymentUpdateRequest,
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        if data.month > group["months"]:
            raise HTTPException(status_code=422, detail="Month is outside this chitti's schedule")
        member = connection.execute(
            "SELECT id FROM chitti_members WHERE id = ? AND group_id = ?",
            (data.member_id, group_id),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")
        existing = connection.execute(
            """
            SELECT amount_paid, custom_amount
            FROM chitti_payments WHERE member_id = ? AND month = ?
            """,
            (data.member_id, data.month),
        ).fetchone()
        if data.amount_paid is not None and data.has_paid is not None:
            raise HTTPException(
                status_code=422,
                detail="Send either amount_paid or has_paid, not both",
            )
        if data.amount_paid is not None:
            amount_paid = data.amount_paid
        elif data.has_paid is not None:
            values = installment_values(group["total_amount"], group["months"])
            custom_amount = existing["custom_amount"] if existing else 0
            amount_paid = (
                round(values["payable"] + custom_amount, 2) if data.has_paid else 0
            )
        else:
            raise HTTPException(
                status_code=422, detail="An amount_paid value is required"
            )

        values = installment_values(group["total_amount"], group["months"])
        prior_payments = connection.execute(
            """
            SELECT payments.month, payments.amount_paid, payments.custom_amount
            FROM chitti_payments AS payments
            WHERE payments.member_id = ? AND payments.month < ?
            """,
            (data.member_id, data.month),
        ).fetchall()
        previous_due = sum(
            round(
                values["payable"] + payment["custom_amount"], 2
            )
            for payment in prior_payments
        )
        previous_due += (data.month - 1 - len(prior_payments)) * round(
            values["payable"], 2
        )
        previous_due = max(
            0,
            round(previous_due - sum(p["amount_paid"] for p in prior_payments), 2),
        )
        current_custom = existing["custom_amount"] if existing else 0
        maximum_payment = round(
            previous_due + values["payable"] + current_custom, 2
        )
        if amount_paid > maximum_payment:
            raise HTTPException(
                status_code=422,
                detail=f"Payment cannot exceed the amount due of {maximum_payment:.2f}",
            )
        paid_at = datetime.now(timezone.utc).isoformat() if amount_paid > 0 else None
        has_paid = amount_paid >= round(values["payable"] + current_custom, 2)
        connection.execute(
            """
            INSERT INTO chitti_payments (member_id, month, has_paid, paid_at, amount_paid)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(member_id, month) DO UPDATE SET
                has_paid = excluded.has_paid,
                paid_at = excluded.paid_at,
                amount_paid = excluded.amount_paid
            """,
            (data.member_id, data.month, int(has_paid), paid_at, amount_paid),
        )
        return serialize_group(connection, group, data.month)


@app.put("/api/chitti/id/{group_id}/comments")
def update_monthly_comment(
    group_id: int,
    data: MonthlyCommentRequest,
    current_user: str = Depends(require_user),
):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        if data.month > group["months"]:
            raise HTTPException(status_code=422, detail="Month is outside this chitti's schedule")
        member = connection.execute(
            "SELECT id FROM chitti_members WHERE id = ? AND group_id = ?",
            (data.member_id, group_id),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")
        connection.execute(
            """
            INSERT INTO chitti_payments (member_id, month, monthly_comment)
            VALUES (?, ?, ?)
            ON CONFLICT(member_id, month)
            DO UPDATE SET monthly_comment = excluded.monthly_comment
            """,
            (data.member_id, data.month, data.comment.strip()),
        )
    return {"monthly_comment": data.comment.strip()}


@app.post("/api/chitti/toggle-payment")
def toggle_payment(data: PaymentToggleRequest, current_user: str = Depends(require_user)):
    with get_auth_db() as connection:
        group = connection.execute(
            "SELECT * FROM chitti_groups WHERE name = ? COLLATE NOCASE",
            (data.chitti_name,),
        ).fetchone()
        if group is None:
            raise HTTPException(status_code=404, detail="Chitti group not found")
        member = connection.execute(
            "SELECT id FROM chitti_members WHERE group_id = ? AND name = ? COLLATE NOCASE",
            (group["id"], data.member_name.strip()),
        ).fetchone()
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found")
    update_payment(
        group["id"],
        PaymentUpdateRequest(member_id=member["id"], month=data.month, has_paid=data.has_paid),
        current_user,
    )
    return {"status": "success", "member": {"name": data.member_name, "has_paid": data.has_paid}}

@app.post("/api/chitti/export-excel")
def export_excel(data: CreateChittiRequest, current_user: str = Depends(require_user)):
    rows = []
    values = installment_values(data.amount, data.months)
    for member in data.members:
        for month in range(1, data.months + 1):
            rows.append({
                "Member": member,
                "Month": month,
                "Value": values["monthly_installment"],
                "Commission": values["commission"],
                "Amount": values["amount_after_commission"],
                "Custom": 0,
                "Payable": values["payable"],
            })
    return create_excel_download(data.chitti_name, rows)


@app.get("/api/chitti/id/{group_id}/export")
def export_saved_chitti(group_id: int, current_user: str = Depends(require_user)):
    with get_auth_db() as connection:
        group = get_group_or_404(connection, group_id)
        members = connection.execute(
            "SELECT id, name FROM chitti_members WHERE group_id = ? ORDER BY id",
            (group_id,),
        ).fetchall()
        values = installment_values(group["total_amount"], group["months"])
        rows = []
        for member in members:
            saved_payments = {
                row["month"]: row
                for row in connection.execute(
                    """
                    SELECT month, has_paid, custom_amount, amount_paid, monthly_comment
                    FROM chitti_payments WHERE member_id = ?
                    """,
                    (member["id"],),
                ).fetchall()
            }
            for month in range(1, group["months"] + 1):
                payment = saved_payments.get(month)
                custom_amount = payment["custom_amount"] if payment else 0
                month_due = round(values["payable"] + custom_amount, 2)
                outstanding_by_month = outstanding_month_balances(
                    saved_payments, month, values["payable"]
                )
                rows.append({
                    "Member": member["name"],
                    "Month": month,
                    "Value": values["monthly_installment"],
                    "Commission": values["commission"],
                    "Amount": values["amount_after_commission"],
                    "Custom": custom_amount,
                    "Payable": month_due,
                    "Amount paid": payment["amount_paid"] if payment else 0,
                    "Paid": outstanding_by_month[-1] <= 0,
                    "Previous months due": round(sum(outstanding_by_month[:-1]), 2),
                    "Due amount": round(sum(outstanding_by_month), 2),
                    "Comment": payment["monthly_comment"] if payment else "",
                })
    return create_excel_download(group["name"], rows)
