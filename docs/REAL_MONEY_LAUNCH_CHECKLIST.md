# Real-Money Launch Checklist

This project can accept test payments through Stripe, persist account balances, and record disputes. That is not the same as being legally ready to launch.

Before enabling live deposits or withdrawals:

- Get written legal review for every target country/state.
- Confirm Stripe allows your exact business model. Stripe may restrict gambling, games of chance, contests with prizes, stored-value wallets, money transmission, and crypto-related flows.
- Add jurisdiction blocking for places where your model is not approved.
- Add age checks and identity verification where required.
- Add AML/KYC and sanctions screening if balances can be withdrawn or transferred.
- Use a production database with backups, migrations, and access controls.
- Store all balance movements in the ledger and never edit balances manually without a ledger entry.
- Monitor Stripe dispute events and freeze accounts while chargebacks are investigated.
- Add customer support, refund policy, privacy policy, and final Terms of Service.
- Do not ship withdrawals until a payout provider and counsel approve the flow.

Stripe webhook events currently handled:

- `checkout.session.completed`: credits the authenticated user balance.
- `charge.dispute.created`: debits the disputed amount and freezes the account.
- `charge.dispute.closed`: restores held balance only if the dispute is won.

Useful Stripe docs:

- https://docs.stripe.com/webhooks
- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/disputes
- https://support.stripe.com/questions/restricted-business-list-faqs
