// Billing Types for Convertra

export type PlanTier = 'free' | 'pro' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
export type InvoiceStatus = 'paid' | 'open' | 'draft' | 'void' | 'uncollectible';

export interface PlanFeatures {
  creativesPerMonth: number;       // -1 for unlimited
  analysesPerMonth: number;        // -1 for unlimited
  channels: number;                // Number of ad channels
  teamMembers: number;             // -1 for unlimited
  prioritySupport: boolean;
  customBranding: boolean;
  apiAccess: boolean;
  dedicatedAccount: boolean;
}

export interface PricingPlan {
  id: PlanTier;
  name: string;
  description: string;
  monthlyPrice: number;            // In dollars, 0 for free
  yearlyPrice: number;             // Per month when billed yearly
  features: PlanFeatures;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  popular?: boolean;
}

export interface Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  planTier: PlanTier;
  billingInterval: BillingInterval;
  currentPeriodStart: string;      // ISO date
  currentPeriodEnd: string;        // ISO date
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;               // ISO date
}

export interface UsageMetrics {
  creativesGenerated: number;
  creativesLimit: number;          // -1 for unlimited
  analysesRun: number;
  analysesLimit: number;           // -1 for unlimited
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export interface Invoice {
  id: string;
  date: string;                    // ISO date
  amount: number;                  // In cents
  status: InvoiceStatus;
  invoiceUrl?: string;             // Link to Stripe-hosted invoice
  pdfUrl?: string;                 // Link to PDF
  description: string;
}

export interface BillingData {
  subscription: Subscription | null;
  usage: UsageMetrics;
  invoices: Invoice[];
  paymentMethodLast4?: string;
  paymentMethodBrand?: string;
}
