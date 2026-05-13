# Stellance Customizations — Developer Documentation

---

## Table of Contents

1. [Leave Group Policy & Leave Management](#1-leave-group-policy--leave-management)
2. [Employee Checkin Customization](#2-employee-checkin-customization)
3. [Site Master & Site Assignment (Supervisor Checkin)](#3-site-master--site-assignment)
4. [Reports](#4-reports)
   - [Daily Manpower Deployment](#41-daily-manpower-deployment)
   - [Staff Attendance Summary](#42-staff-attendance-summary)

---

## 1. Leave Group Policy & Leave Management

### Overview

Leave Group Policy is a custom DocType that defines how leaves are accrued and how long they stay valid for a group of employees. Instead of HRMS's built-in manual allocation, leaves are accrued automatically every month and expire after a configurable window.

### DocType: Leave Group Policy

| Field | Type | Description |
|---|---|---|
| Group Name | Data | Unique name for the policy (used as document ID) |
| Leave Period | Link → Leave Period | The HRMS Leave Period this policy applies to (defines from_date / to_date) |
| Carry Forward Months | Int (default: 6) | Number of months each monthly batch of leaves remains valid |
| Comp-off Validity Months | Int (default: 6) | Number of months comp-off leaves remain valid from the work date |
| Leave Allocations | Table → Leave Group Leave Detail | Rows: Leave Type + Yearly/Monthly allocation count |

### Linking Policy to an Employee

Set the **Leave Group Policy** field (`custom_leave_group_policy`) on the Employee record. When this field is saved for the first time on an employee, the system automatically runs a backfill to allocate leaves from the joining date through today.

### How Leave Accrual Works (`leave_management.py`)

The system maintains **one Leave Allocation per employee per leave type** that spans from the employee's effective start date to the leave period end date. The allocation's `new_leaves_allocated` is recalculated every month.

#### Batch Expiry Logic

Each month's accrual is called a "batch." A batch expires after `carry_forward_months` months.

```
April batch + carry_forward_months=6 → expires Sep 30
May   batch + carry_forward_months=6 → expires Oct 31
```

Formula: `expiry = last day of (alloc_month + carry_forward_months - 1)`

#### Monthly Calculation

On the 1st of each month, `_compute_valid_accrual()` sums all non-expired batches:

```
valid_leaves = Σ (monthly_rate × fraction) for each non-expired month
```

- `fraction = 1.0` for full months
- `fraction = (days_remaining_in_month / days_in_month)` for the joining month if employee joined mid-month
- LWP and Compensatory leave types are skipped

The allocation's `new_leaves_allocated` is set to `max(valid_accrual, leaves_already_taken)` to prevent negative balances.

#### Example

Employee joins April 17, carry_forward_months = 6, monthly rate = 1.5 leaves/month.

| Run date | April batch | May batch | June batch | … | Total allocated |
|---|---|---|---|---|---|
| May 1 | 0.7 (pro-rated 14/30) | 1.5 | — | | 2.2 |
| Jun 1 | 0.7 | 1.5 | 1.5 | | 3.7 |
| Oct 1 | expired (Sep 30) | 1.5 | 1.5 | … | drops April |

#### Allocation Document Structure

```
Leave Allocation:
  employee      = <employee>
  leave_type    = <leave_type>
  from_date     = effective_start (max of joining_date, lp_from)
  to_date       = leave_period end date (lp_to)
  new_leaves_allocated = sum of valid batches
  carry_forward = 0  (expiry is managed by this system, not HRMS)
```

### Trigger Points

| Event | Function | When |
|---|---|---|
| Employee saved with policy for first time | `backfill_leaves_from_joining()` | Allocates from joining month through today |
| Employee saved (any time) | `allocate_joining_month_leaves()` | Creates/updates allocation if employee is active |
| Monthly scheduler (1st of each month) | `allocate_monthly_leaves()` | Adds new month's accrual, drops expired batches |
| On-demand expiry run | `expire_old_leaves()` | Same as monthly scheduler; can be run any time |

### Late Policy Assignment (Backfill)

If HR forgets to assign a policy and assigns it later:

1. `before_save` on Employee detects `prev_policy` was empty and sets `flags.leave_policy_newly_assigned = True`
2. `after_save` calls `backfill_leaves_from_joining()` which runs `_sync_allocation()`
3. `_compute_valid_accrual()` iterates from the joining month to today, including all past non-expired months
4. One allocation is created covering all months from the joining date

### Stale Allocation Cleanup

When creating a new allocation, any existing non-cancelled allocation for the same employee + leave type (with a different `to_date`) is cancelled and deleted before the new one is inserted.

### Running Manually

```bash
# Run full sync for all employees
bench --site <site> execute stellance_customizations.leave_management.allocate_monthly_leaves

# Run expiry check
bench --site <site> execute stellance_customizations.leave_management.expire_old_leaves
```

---

## 2. Employee Checkin Customization

### Overview

When an employee checks in via the mobile app or kiosk (which captures GPS coordinates), the system automatically reverse-geocodes the latitude/longitude into a human-readable address and stores it on the Employee Checkin record.

### File

`stellance_customizations/overrides/employee_checkin.py`

### Hook

```python
# hooks.py
"Employee Checkin": {
    "before_insert": "set_address_from_coordinates"
}
```

### How It Works

1. On `before_insert` of Employee Checkin, `set_address_from_coordinates()` is called.
2. If the record already has a `custom_address` set, or has no latitude/longitude, the function returns immediately (no API call).
3. Otherwise, it calls the **Nominatim OpenStreetMap** reverse geocoding API:
   ```
   GET https://nominatim.openstreetmap.org/reverse
       ?format=json
       &lat=<latitude>
       &lon=<longitude>
   ```
4. The `display_name` from the JSON response (full formatted address) is written to `custom_address`.
5. If the API call fails (timeout, network error), the error is logged via `frappe.log_error` and the checkin is still saved without an address.

### Custom Field Required

The DocType `Employee Checkin` must have the custom field `custom_address` (type: Data or Small Text) added via Custom Fields.

### API Details

| Property | Value |
|---|---|
| Provider | Nominatim (OpenStreetMap) |
| Endpoint | `https://nominatim.openstreetmap.org/reverse` |
| Timeout | 5 seconds |
| User-Agent | `StellaNCE/1.0 (prathamjadhav052@gmail.com)` |
| Rate limit | 1 request/second (Nominatim free tier policy) |

### Error Handling

All exceptions are caught silently. The checkin is never blocked due to a geocoding failure. Errors appear in the Frappe Error Log under the title "Employee Checkin – reverse geocode failed".

---

## 3. Site Master & Site Assignment

### Overview

These two custom DocTypes support the site-based deployment model where employees (workers, supervisors, sub-contractors) are assigned to project sites on a daily basis. This data feeds into the attendance reports.

### DocType: Site Master

A registry of physical sites where employees are deployed.

| Field | Type | Description |
|---|---|---|
| Site Name | Data | Unique name; used as the document ID |
| Address Line 1 | Data | Street address |
| Address Line 2 | Data | Additional address |
| City | Data | City |
| State | Data | State |

**Permissions:** System Manager only (read/write/create/delete).

### DocType: Site Assignment

Records which employees are deployed to which project/site on a given date.

| Field | Type | Description |
|---|---|---|
| Project (Site) | Link → Project | The ERPNext Project that represents the site |
| Date | Date | Assignment date (defaults to today) |
| Is Active | Check | Whether this assignment is active (default: Yes) |
| Employees | Table → Site Assignment Employee | List of employees assigned |

**Naming:** Auto-named as `SA-{project}-{date}`

**Permissions:**

| Role | Create | Read | Write | Delete |
|---|---|---|---|---|
| System Manager | ✓ | ✓ | ✓ | ✓ |
| HR Manager | ✓ | ✓ | ✓ | ✓ |
| Supervisor | ✓ | ✓ | ✓ | — |

> Supervisors can create and update site assignments for their own site but cannot delete records.

### Child Table: Site Assignment Employee

| Field | Description |
|---|---|
| Employee | Link to Employee |
| Employee Name | Auto-filled from Employee on selection |
| Designation | Auto-filled from Employee on selection |

When a supervisor adds an employee row and selects the Employee, the JavaScript (`site_assignment.js`) automatically fetches and fills the employee's name and designation. If the employee is not found, a red alert is shown.

### Relationship to Attendance Reports

The Site Assignment data is joined with `tabAttendance` in the reports to:
- Show which site each employee was deployed to on each day (Daily Manpower Deployment)
- Group attendance counts by site (Staff Attendance Summary)

An employee's attendance counts toward a site on a given day only if there is an **active** (`is_active = 1`) Site Assignment for that date linking the employee to the site.

---

## 4. Reports

### 4.1 Daily Manpower Deployment

**Path:** `stellance_customizations/report/daily_manpower_deployment/`
**Type:** Script Report

#### Purpose

Shows a monthly calendar grid of every active employee with their attendance status per day. HR and site managers use this to track who was present/absent across the full month at a glance.

#### Filters

| Filter | Type | Required | Description |
|---|---|---|---|
| Month | Select (Jan–Dec) | Yes | Calendar month; defaults to current month |
| Year | Int | Yes | Calendar year; defaults to current year |
| Designation | MultiSelectList | No | Filter to specific designation(s) |
| On Site | Check | No | If checked, shows only employees with a Site Assignment in that month |

#### Columns

| Column | Description |
|---|---|
| Employee | Employee ID (link) |
| Name | Employee full name |
| Designation | Employee designation |
| 1 Mon … 31 Sun | One column per day of the month, showing attendance badge + site name |
| Present | Total present days in month |
| Absent | Total absent days |
| Half Day | Total half-day count |
| Leave | Total on-leave days |

#### Attendance Badges

| Status | Badge | Color |
|---|---|---|
| Present | P | Green |
| Absent | A | Red |
| Half Day | HD | Orange |
| Work From Home | WFH | Blue |
| On Leave | L | Purple |
| Holiday | H | Teal |
| Weekly Off | WO | Grey |

If the employee had a Site Assignment on that day, the site name is shown in small text next to the badge: `P (Site Name)`.

#### Data Source

- `tabEmployee` — Active employees, filtered by designation if provided
- `tabAttendance` — Submitted attendance records for the month
- `tabSite Assignment` + `tabSite Assignment Employee` — Site name per employee per day

---

### 4.2 Staff Attendance Summary

**Path:** `stellance_customizations/report/staff_attendance_summary/`
**Type:** Script Report

#### Purpose

Shows a monthly headcount summary **per site**, broken into supervisors, own workers (O), and sub-contractors (C). Two rows are rendered per site: one showing supervisor names, one showing counts. A **Daily Total** footer row summarizes unique headcounts across all sites per day.

#### Filters

| Filter | Type | Required | Description |
|---|---|---|---|
| Month | Select | Yes | Calendar month |
| Year | Int | Yes | Calendar year |

#### Columns

| Column | Description |
|---|---|
| Site | Project/site name (or blank for count row) |
| 1 … 31 | One column per day |
| Total O (Own) | Monthly sum of own-worker days for the site |
| Total C (Sub-Contract) | Monthly sum of sub-contractor days |
| Grand Total | Total O + Total C |

#### Row Format (per site)

**Row 1 — Supervisor names:**
```
Site Name | John Doe, Jane Smith | ... | (supervisor names per day)
```

**Row 2 — Headcount:**
```
(blank)   | S:1 O:5 C:3          | ... | (S=supervisors, O=own workers, C=contractors)
```

**Footer row — Daily Total:**
```
Daily Total | S:2 O:10 C:5 | ... | (unique employees across all sites that day)
```

#### Designation Mapping

The report classifies employees into three buckets based on their designation (case-insensitive):

| Designation value | Bucket |
|---|---|
| `site supervisor` | Supervisor (S) |
| `workers` | Own worker (O) |
| `sub-contractor` | Sub-contractor (C) |

The designation is taken from `tabSite Assignment Employee.designation` if set, falling back to `tabEmployee.designation`.

#### Data Source

- `tabAttendance` — Present / Work From Home / Half Day records only
- `tabSite Assignment` + `tabSite Assignment Employee` — Maps employee to site on each date
- `tabProject` — Resolves site name from the Project linked in Site Assignment

Only employees with an **active** Site Assignment on the attendance date are included. Employees without a site assignment are excluded from this report.
