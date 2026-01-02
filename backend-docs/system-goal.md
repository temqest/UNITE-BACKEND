UNITE Blood Bank System
Product Vision & Functional Blueprint
System Purpose

This system streamlines the planning, approval, scheduling, and monitoring of blood-related activities for the Bicol Medical Center Blood Bank. It centralizes event requests, admin workflows, scheduling rules, and event tracking to maintain an organized and capacity-safe operations pipeline.

Primary users:

System Administrators

Coordinators / Stakeholders

Core Objectives

Allow coordinators to request, modify, and confirm blood-related events

Enable admins to review, approve, reject, or reschedule event requests

Enforce operational rules (daily capacity, bag limits, weekend restrictions)

Operate a double-confirmation approval process

Generate notifications across the event lifecycle

Provide calendar-based and list-based visibility into scheduled events

Store detailed logistics, staff, and institutional information

Key System Capabilities
1. Event Request & Scheduling Workflow

Coordinator Features

Submit event requests

Select category: Blood Drive, Advocacy, Training

Enter event details (venue, audience, participants, logistics, blood bag target)

Modify pending requests before admin action

Confirm events after admin approval (final confirmation stage)

Scheduling Rules

Maximum 3 events per day

Blood drive total per day ≤ 200 blood bags

No weekend events unless admin overrides

One pending event per coordinator at a time

Pending request auto-follow-up after 3 days

2. Admin Controls

Admins can:

Review new and pending submissions

Approve, reject, or reschedule events

Override weekend restriction

Modify event schedule rules if required

Provide final confirmation post-coordinator approval

View dashboard notifications, upcoming events, logs, and activity history

Assign staff and view event roles

3. Double-Confirmation Logic

Event finalization sequence:

Coordinator submits request

Admin reviews and approves

Coordinator confirms approval

Admin confirms final schedule

Notifications trigger at every stage.

4. Notification System

Coordinator Notifications

Event accepted, rejected, or rescheduled

Confirmation request received

Pending confirmation expires after 3 days

Admin Notifications

New event request submitted

Coordinator response in workflow

Pending confirmation awaits admin action

Notifications appear in dashboard and inbox.

5. Event Views
View	Description
Overview Page	Table of events, status badges (Pending, Approved, Confirmed, Rejected, Completed, Rescheduled)
Calendar View	Google-Calendar-style interface; category-colored events; daily / weekly / monthly modes
6. Event Data Requirements

Each event stores:

Field	Description
Coordinator details	name, phone, email
Event category	Blood Drive / Advocacy / Training
Location	venue or institution
Audience	target audience type
Participant limit	expected size
Staff list	assigned staff per event
Blood bag target	applicable to blood drives
Logistics notes	optional travel / coordination details
Timestamps	created, updated, confirmed dates
Deliverable Views for Demonstration

Admin Portal

Dashboard with logs, alerts, upcoming events

Event approval & scheduling panel

Calendar visualization

Staff assignment tools

Coordinator Portal

Event request form and editing

Pending & approved event list

Notification inbox

Event confirmation & rescheduling tools

Calendar access

Success Criteria

The system is considered complete when:

Functional Requirements

Coordinators can request, update, confirm, and track events end-to-end

Admins can enforce rules, schedule, approve, and finalize events

Notifications and double-confirmation workflow operate reliably

Calendar reflects active and confirmed events accurately

Scheduling rules (max events/day, blood bag limit, weekend rule) function automatically

Deployment & Technical Requirements

System runs smoothly in cloud and container environments:

Backend successfully deployed to Render (or equivalent)

Frontend deployed on Vercel (or equivalent)

Application stack runs in Docker containers with production configs

System works in Synology NAS environment (Docker or local deployment)

Environment variables, build pipelines, and network layers function consistently across environments

Documentation for deployment and environment setup is complete