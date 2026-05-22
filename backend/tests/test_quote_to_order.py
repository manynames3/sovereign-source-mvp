from backend.services.materials import get_material
from backend.services.pricing import PricingInput, estimate_price
from backend.services.review_rules import evaluate_review_required

SAMPLE_DXF = b"""0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
100
21
50
0
ENDSEC
0
EOF
"""


def quote_payload(**overrides):
    data = {
        "process_type": "laser_cutting",
        "material": "aluminum_6061",
        "thickness_mm": "3.0",
        "quantity": "5",
        "finish": "deburred",
        "tolerance": "standard",
        "shipping_zip": "78701",
        "target_delivery_date": "2027-01-15",
        "notes": "standard bracket",
    }
    data.update(overrides)
    return data


def create_quote(client, **overrides):
    response = client.post(
        "/quote/metal",
        data=quote_payload(**overrides),
        files={"file": ("part.dxf", SAMPLE_DXF, "application/dxf")},
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_rfq(client):
    quote = create_quote(client)
    response = client.post(
        "/rfq/submit",
        json={
            "quote_id": quote["quote_id"],
            "customer_name": "Ada Mason",
            "email": "ada@example.com",
            "phone": "555-0100",
            "company": "Apex Metal Buyers",
            "notes": "Please review for production.",
            "consent_to_review": True,
        },
    )
    assert response.status_code == 200, response.text
    return quote, response.json()


def ready_rfq(client):
    quote, rfq = create_rfq(client)
    response = client.patch(
        f"/admin/rfq/{rfq['rfq_id']}/review",
        json={
            "status": "ready_for_final_quote",
            "internal_notes": "Flat part looks manufacturable.",
            "reviewed_by": "admin@example.com",
            "manufacturability_notes": "Use 3 mm 6061 sheet, deburr edges.",
            "recommended_process": "laser_cutting",
            "required_changes": None,
            "review_required": False,
        },
    )
    assert response.status_code == 200, response.text
    return quote, rfq


def create_final_quote(client):
    _, rfq = ready_rfq(client)
    response = client.post(
        f"/admin/rfq/{rfq['rfq_id']}/final-quote",
        json={
            "final_price": 875.0,
            "final_lead_time_days": 9,
            "final_process_type": "laser_cutting",
            "final_material": "aluminum_6061",
            "final_finish": "deburred",
            "quote_expiration_date": "2027-02-01",
            "production_notes": "Final quote after human manufacturability review.",
            "payment_required_type": "deposit",
            "deposit_amount": 250.0,
        },
    )
    assert response.status_code == 200, response.text
    return rfq, response.json()


def approved_order(client):
    _, final_quote = create_final_quote(client)
    response = client.post(f"/quote/final/{final_quote['final_quote_id']}/approve")
    assert response.status_code == 200, response.text
    return final_quote, response.json()


def test_creating_budgetary_quote(client):
    quote = create_quote(client)
    assert quote["quote_type"] == "budgetary_estimate"
    assert quote["file"]["valid"] is True
    assert quote["file"]["geometry_status"] == "analyzed"
    assert quote["estimated_price_range"]["high"] > quote["estimated_price_range"]["low"] > 0
    assert "budgetary estimate only" in quote["disclaimer"].lower()


def test_invalid_file_extension_rejected(client):
    response = client.post(
        "/quote/metal",
        data=quote_payload(),
        files={"file": ("part.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert "Unsupported file type" in response.text


def test_invalid_quantity_rejected(client):
    response = client.post(
        "/quote/metal",
        data=quote_payload(quantity="0"),
        files={"file": ("part.dxf", SAMPLE_DXF, "application/dxf")},
    )
    assert response.status_code == 400
    assert "Quantity" in response.text


def test_missing_thickness_for_laser_cutting_rejected(client):
    data = quote_payload()
    data.pop("thickness_mm")
    response = client.post(
        "/quote/metal",
        data=data,
        files={"file": ("part.dxf", SAMPLE_DXF, "application/dxf")},
    )
    assert response.status_code == 400
    assert "thickness_mm" in response.text


def test_material_lookup():
    material = get_material("titanium_grade_5")
    assert material.review_required is True
    assert material.raw_cost_per_kg > get_material("mild_steel").raw_cost_per_kg


def pricing_input(process_type):
    return PricingInput(
        process_type=process_type,
        material=get_material("aluminum_6061"),
        thickness_mm=3.0,
        quantity=10,
        finish="deburred",
        tolerance="standard",
        geometry={
            "volume_cm3": 15,
            "surface_area_cm2": 100,
            "bounding_box_mm": {"x": 100, "y": 50, "z": 3},
            "metadata": {"cut_length_mm": 300, "entity_count": 4},
        },
    )


def test_laser_pricing_calculation():
    result = estimate_price(pricing_input("laser_cutting"))
    assert result.price_high > result.price_low > 0
    assert result.cost_breakdown["setup_cost"] == 85


def test_waterjet_pricing_calculation():
    result = estimate_price(pricing_input("waterjet_cutting"))
    assert result.price_high > result.price_low > 0
    assert result.lead_time_high >= 12


def test_sheet_metal_pricing_calculation():
    result = estimate_price(pricing_input("sheet_metal_bending"))
    assert result.price_high > result.price_low > 0
    assert result.cost_breakdown["machine_or_cutting_cost"] > 0


def test_cnc_pricing_calculation():
    result = estimate_price(pricing_input("cnc_milling"))
    assert result.price_high > result.price_low > 0
    assert result.lead_time_low >= 12


def test_review_required_rules_for_cnc_titanium_and_critical_notes():
    required, reasons = evaluate_review_required(
        file_extension="stl",
        geometry_status="analyzed",
        geometry={
            "watertight": False,
            "bounding_box_mm": {"x": 50, "y": 50, "z": 20},
            "metadata": {},
        },
        material=get_material("titanium_grade_5"),
        process_type="cnc_milling",
        tolerance="critical",
        finish="custom",
        quantity=1,
        estimated_high=1200,
        notes="Requires tapped holes and inspection.",
    )
    assert required is True
    assert any("CNC milling" in reason for reason in reasons)
    assert any("Titanium" in reason for reason in reasons)
    assert any("not watertight" in reason for reason in reasons)


def test_submit_rfq(client):
    quote, rfq = create_rfq(client)
    assert rfq["quote_id"] == quote["quote_id"]
    assert rfq["status"] == "needs_review"
    assert rfq["review_required"] is False


def test_admin_review_update(client):
    _, rfq = create_rfq(client)
    response = client.patch(
        f"/admin/rfq/{rfq['rfq_id']}/review",
        json={
            "status": "in_review",
            "internal_notes": "Checking bend reliefs.",
            "reviewed_by": "admin@example.com",
            "manufacturability_notes": "Needs DXF cleanup.",
            "recommended_process": "laser_cutting",
            "required_changes": "Confirm corner radius.",
            "review_required": True,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "in_review"
    assert response.json()["required_changes"] == "Confirm corner radius."


def test_create_final_quote(client):
    _, final_quote = create_final_quote(client)
    assert final_quote["status"] == "pending_customer_approval"
    assert final_quote["final_price"] == 875.0
    assert final_quote["deposit_amount"] == 250.0


def test_approve_final_quote_creates_order(client):
    final_quote, approval = approved_order(client)
    assert approval["final_quote_id"] == final_quote["final_quote_id"]
    assert approval["payment_required"] is True
    order = client.get(f"/orders/{approval['order_id']}")
    assert order.status_code == 200
    assert order.json()["status"] == "payment_pending"


def test_reject_final_quote(client):
    _, final_quote = create_final_quote(client)
    response = client.post(
        f"/quote/final/{final_quote['final_quote_id']}/reject",
        json={"rejection_reason": "Lead time is too long."},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"


def test_create_mock_payment_session(client):
    _, approval = approved_order(client)
    response = client.post(f"/orders/{approval['order_id']}/payment-session")
    assert response.status_code == 200, response.text
    assert response.json()["amount_due"] == 250.0
    assert response.json()["payment_type"] == "deposit"


def test_confirm_successful_payment_updates_paid_order(client):
    _, approval = approved_order(client)
    session = client.post(f"/orders/{approval['order_id']}/payment-session").json()
    response = client.post(
        "/payments/mock-confirm",
        json={"payment_session_id": session["payment_session_id"], "payment_status": "paid"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment_status"] == "paid"
    assert body["order_status"] == "paid"
    assert body["rfq_status"] == "paid"
    order = client.get(f"/orders/{approval['order_id']}").json()
    assert order["payment_status"] == "paid"
    assert order["amount_paid"] == 250.0


def test_confirm_failed_payment_keeps_order_pending(client):
    _, approval = approved_order(client)
    session = client.post(f"/orders/{approval['order_id']}/payment-session").json()
    response = client.post(
        "/payments/mock-confirm",
        json={"payment_session_id": session["payment_session_id"], "payment_status": "failed"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment_status"] == "failed"
    assert body["order_status"] == "payment_pending"


def test_submit_access_request(client):
    response = client.post(
        "/access/request",
        json={
            "name": "Ada Mason",
            "email": "ADA@EXAMPLE.COM",
            "company": "Apex Metal Buyers",
            "role": "procurement lead",
            "use_case": "Pilot controlled RFQ intake and final quote review for custom metal parts.",
            "estimated_monthly_rfqs": 25,
            "notes": "Need demo workspace before uploading production data.",
            "consent_to_contact": True,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["request_id"].startswith("access_")
    assert body["status"] == "new"
    assert body["email"] == "ada@example.com"


def test_access_request_requires_consent(client):
    response = client.post(
        "/access/request",
        json={
            "name": "Ada Mason",
            "email": "ada@example.com",
            "company": "Apex Metal Buyers",
            "role": "procurement lead",
            "use_case": "Pilot controlled RFQ intake and final quote review for custom metal parts.",
            "consent_to_contact": False,
        },
    )
    assert response.status_code == 400
    assert "consent_to_contact" in response.text
