import Link from "next/link";
import { Icon } from "../../components/Icon";

export default function StorefrontHome() {
  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Storefront</h1>
      <div className="gg-appgrid">
        <Link href="/storefront/take-order" className="gg-app">
          <span className="gg-app-ico">
            <Icon name="cart" size={40} aria-hidden />
          </span>
          <h3>Take Order</h3>
        </Link>

        <Link href="/storefront/orders" className="gg-app">
          <span className="gg-app-ico">
            <Icon name="list" size={40} aria-hidden />
          </span>
          <h3>View Orders</h3>
        </Link>

        <Link href="/storefront/inventory" className="gg-app">
          <span className="gg-app-ico">
            <Icon name="boxes" size={40} aria-hidden />
          </span>
          <h3>View Inventory</h3>
        </Link>
      </div>
    </>
  );
}
