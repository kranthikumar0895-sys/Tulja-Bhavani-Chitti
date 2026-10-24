import axios from "axios";

interface ApiFailure {
  config?: {
    headers?: {
      Authorization?: unknown;
      authorization?: unknown;
    };
  };
  response?: {
    status?: number;
  };
}

const isApiFailure = (error: unknown): error is ApiFailure =>
  typeof error === "object" && error !== null && ("config" in error || "response" in error);

export interface ChittiMember {
  id: number;
  name: string;
  has_paid: boolean;
  paid_at: string | null;
  amount_paid: number;
  custom_amount: number;
  payable: number;
  prior_month_due: number;
  due_amount: number;
  monthly_comment: string;
}

export interface ChittiGroup {
  id: number;
  chitti_name: string;
  total_amount: number;
  months: number;
  monthly_installment: number;
  commission: number;
  amount_after_commission: number;
  payable_per_member: number;
  current_month: number;
  selected_month: number;
  total_members: number;
  paid_count: number;
  pending_count: number;
  total_collected: number;
  total_pending: number;
  members: ChittiMember[];
}

export interface ScheduleMonth {
  month: number;
  monthly_installment: number;
  commission: number;
  amount_after_commission: number;
  payable: number;
  custom_amount: number;
  has_paid: boolean;
  paid_at: string | null;
  amount_paid: number;
  prior_month_due: number;
  due_amount: number;
  monthly_comment: string;
}

export interface MemberSchedule {
  group_id: number;
  member_id: number;
  member_name: string;
  months: ScheduleMonth[];
}

export const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
export const api = axios.create({ baseURL: API_BASE_URL });

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  const isPublicAuthRequest =
    config.url?.startsWith("/auth/status") ||
    config.url?.startsWith("/auth/login") ||
    config.url?.startsWith("/auth/register") ||
    config.url?.startsWith("/auth/password-reset/");
  if (token && config.headers && !isPublicAuthRequest) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const hasAuthHeader = isApiFailure(error) && Boolean(
      error.config?.headers?.Authorization || error.config?.headers?.authorization
    );
    if (isApiFailure(error) && error.response?.status === 401 && hasAuthHeader) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        sessionStorage.setItem(
          "auth_message",
          "Your session expired or is no longer valid. Sign in again, then retry your action."
        );
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export const getGroups = async (): Promise<ChittiGroup[]> =>
  (await api.get<ChittiGroup[]>("/chitti")).data;

export const getGroup = async (id: number, month?: number): Promise<ChittiGroup> =>
  (await api.get<ChittiGroup>(`/chitti/id/${id}`, { params: month ? { month } : undefined })).data;

export const getMemberSchedule = async (
  groupId: number,
  memberId: number
): Promise<MemberSchedule> =>
  (await api.get<MemberSchedule>(`/chitti/id/${groupId}/schedule`, {
    params: { member_id: memberId },
  })).data;
