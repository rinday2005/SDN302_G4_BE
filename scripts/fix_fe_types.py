# 1. Fix ShopRentOrderDetail.tsx
path_shop = r"C:\SDN302_G4_FE\src\pages\rent\shop\ShopRentOrderDetail.tsx"
with open(path_shop, "r", encoding="utf-8") as f:
    code_shop = f.read()

old_state = "type DemoState = 'pending' | 'paid' | 'shipping' | 'renting' | 'return_requested' | 'returning' | 'inspecting' | 'completed';"
new_state = "type DemoState = 'pending' | 'paid' | 'shipping' | 'renting' | 'return_requested' | 'returning' | 'inspecting' | 'completed' | 'disputed';"

if old_state in code_shop:
    code_shop = code_shop.replace(old_state, new_state)
    with open(path_shop, "w", encoding="utf-8") as f:
        f.write(code_shop)
    print("Fixed ShopRentOrderDetail.tsx")
else:
    print("old_state not found in ShopRentOrderDetail.tsx")

# 2. Fix RentOrderDetail.tsx
path_user = r"C:\SDN302_G4_FE\src\pages\rent\orders\RentOrderDetail.tsx"
with open(path_user, "r", encoding="utf-8") as f:
    code_user = f.read()

target_modal_decl = "const [activeModal, setActiveModal] = useState<'bench' | 'complaint' | 'invoice' | 'cla_success' | null>(null);"
if "const [userDisputeReason, setUserDisputeReason]" not in code_user:
    code_user = code_user.replace(
        target_modal_decl,
        target_modal_decl + "\n  const [userDisputeReason, setUserDisputeReason] = useState<string>('');"
    )

code_user = code_user.replace("cleanId", "id || ''")

with open(path_user, "w", encoding="utf-8") as f:
    f.write(code_user)
print("Fixed RentOrderDetail.tsx")

