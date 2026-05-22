from dataclasses import dataclass


@dataclass(frozen=True)
class PaymentSession:
    payment_url: str
    status: str = "pending"


class PaymentProvider:
    def create_session(self, *, payment_session_id: str, amount_due: float, payment_type: str) -> PaymentSession:
        raise NotImplementedError


class MockPaymentProvider(PaymentProvider):
    def create_session(self, *, payment_session_id: str, amount_due: float, payment_type: str) -> PaymentSession:
        return PaymentSession(
            payment_url=f"/payments/mock/{payment_session_id}?amount={amount_due:.2f}&type={payment_type}",
            status="pending",
        )
