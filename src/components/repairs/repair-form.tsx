"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { intakeRepair } from "@/app/(app)/repairs/actions";
import { initialRepairState, type RepairActionState } from "@/lib/validators/repair";

export type SoldItemOption = {
  id: string;
  serial: string;
  product_name: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
};

export type RepairCustomerOption = {
  id: string;
  name: string;
  mobile_no: string | null;
};

export type TechnicianOption = {
  id: string;
  name: string;
};

export function RepairForm({
  branches,
  lockedBranchId,
  soldItems,
  customers,
  technicians,
}: {
  branches: { id: string; name: string }[];
  lockedBranchId: string | null;
  soldItems: SoldItemOption[];
  customers: RepairCustomerOption[];
  technicians: TechnicianOption[];
}) {
  const [state, formAction, pending] = useActionState<
    RepairActionState,
    FormData
  >(intakeRepair, initialRepairState);

  const [fromSale, setFromSale] = useState(true);
  const [selectedItem, setSelectedItem] = useState<SoldItemOption | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [contactNo, setContactNo] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const filteredItems = useMemo(() => {
    const trimmed = itemQuery.trim().toLowerCase();
    if (trimmed.length === 0) return soldItems.slice(0, 50);
    return soldItems
      .filter((item: SoldItemOption) => {
        const serial = item.serial.toLowerCase();
        const product = item.product_name.toLowerCase();
        const customer = item.customer_name?.toLowerCase() ?? "";
        return (
          serial.includes(trimmed) ||
          product.includes(trimmed) ||
          customer.includes(trimmed)
        );
      })
      .slice(0, 50);
  }, [soldItems, itemQuery]);

  const filteredCustomers = useMemo(() => {
    const trimmed = customerQuery.trim().toLowerCase();
    if (trimmed.length === 0) return customers.slice(0, 50);
    return customers
      .filter((customer: RepairCustomerOption) => {
        const name = customer.name.toLowerCase();
        const mobile = customer.mobile_no?.toLowerCase() ?? "";
        return name.includes(trimmed) || mobile.includes(trimmed);
      })
      .slice(0, 50);
  }, [customers, customerQuery]);

  const selectedCustomer = customers.find(
    (customer: RepairCustomerOption) => customer.id === selectedCustomerId,
  );

  function handleSelectItem(item: SoldItemOption) {
    setSelectedItem(item);
    if (item.customer_id) setSelectedCustomerId(item.customer_id);
    if (item.customer_mobile) setContactNo(item.customer_mobile);
  }

  const lockedBranch = branches.find(
    (branch: { id: string; name: string }) => branch.id === lockedBranchId,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input
        type="hidden"
        name="sale_line_item_id"
        value={fromSale ? (selectedItem?.id ?? "") : ""}
      />
      <input type="hidden" name="customer_id" value={selectedCustomerId} />

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="branch_id">Branch</Label>
        {lockedBranchId ? (
          <>
            <input type="hidden" name="branch_id" value={lockedBranchId} />
            <p className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              {lockedBranch?.name ?? "Your branch"}
            </p>
          </>
        ) : (
          <Select name="branch_id" disabled={pending}>
            <SelectTrigger id="branch_id">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: { id: string; name: string }) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Unit for repair</h2>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setFromSale(!fromSale);
              setSelectedItem(null);
            }}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            {fromSale ? "Enter serial manually" : "Find from a sale"}
          </button>
        </div>

        {fromSale ? (
          <div className="grid gap-1.5">
            <Input
              id="item-search"
              placeholder="Type to filter by serial, product, or customer"
              value={itemQuery}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setItemQuery(event.target.value)
              }
              disabled={pending}
            />
            {selectedItem ? (
              <p className="text-sm text-muted-foreground">
                Selected:{" "}
                <span className="font-medium text-foreground">
                  {selectedItem.product_name}
                </span>{" "}
                (Serial: {selectedItem.serial})
              </p>
            ) : null}
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              {filteredItems.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No sold items match.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {filteredItems.map((item: SoldItemOption) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleSelectItem(item)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 ${
                          item.id === selectedItem?.id
                            ? "bg-accent text-accent-foreground"
                            : ""
                        }`}
                      >
                        <span className="font-medium">
                          {item.product_name} — {item.serial}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.customer_name ?? "Walk-in"} · {item.sale_date}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="manual_serial">Serial number</Label>
            <Input id="manual_serial" name="manual_serial" disabled={pending} />
          </div>
        )}
      </div>

      {fromSale ? null : (
        <div className="grid gap-3">
          <Label>Customer (optional)</Label>
          <Input
            id="customer-search"
            placeholder="Type to filter by name or mobile"
            value={customerQuery}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setCustomerQuery(event.target.value)
            }
            disabled={pending}
          />
          {selectedCustomer ? (
            <p className="text-sm text-muted-foreground">
              Selected:{" "}
              <span className="font-medium text-foreground">
                {selectedCustomer.name}
              </span>
              {selectedCustomer.mobile_no ? ` (${selectedCustomer.mobile_no})` : ""}
            </p>
          ) : null}
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {filteredCustomers.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No customers match.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {filteredCustomers.map((customer: RepairCustomerOption) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId(customer.id);
                        if (customer.mobile_no) setContactNo(customer.mobile_no);
                      }}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                        customer.id === selectedCustomerId
                          ? "bg-accent text-accent-foreground"
                          : ""
                      }`}
                    >
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {customer.mobile_no ?? "No mobile"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="contact_no">Contact no.</Label>
          <Input
            id="contact_no"
            name="contact_no"
            value={contactNo}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setContactNo(event.target.value)
            }
            disabled={pending}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="assigned_to">Technician (optional)</Label>
          <Select name="assigned_to" disabled={pending}>
            <SelectTrigger id="assigned_to">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {technicians.map((tech: TechnicianOption) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="downpayment">Downpayment (optional)</Label>
          <Input
            id="downpayment"
            name="downpayment"
            type="number"
            min="0"
            step="0.01"
            disabled={pending}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sar_no">SAR no. (blank = auto)</Label>
          <Input id="sar_no" name="sar_no" disabled={pending} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="issue_description">Issue description</Label>
        <textarea
          id="issue_description"
          name="issue_description"
          rows={3}
          disabled={pending}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="initial_note">Note on the received update (optional, visible to customer)</Label>
        <Input id="initial_note" name="initial_note" disabled={pending} />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Recording..." : "Record repair intake"}
        </Button>
      </div>
    </form>
  );
}
