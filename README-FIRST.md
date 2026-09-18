# The three files that make New Enquiry work

    src/features/portal/DeveloperPortal.jsx   the button and the form
    src/features/portal/enquiryFlow.js        the branching
    netlify/functions/portal.js               serves the sheet, takes answers

All three, or none. They are one feature:

- DeveloperPortal alone: the button enables, then fails on fetch
- portal.js alone: the endpoints exist and nothing calls them

## How to know each landed

    DeveloperPortal.jsx   search for: openEnquiry
    enquiryFlow.js        the file exists at all
    portal.js             search for: enquiry-form

All three present, deploy, hard-refresh.

## Then

Admin › Enquiry Sheets → build a sheet → Audience "developer" → Make
this the live sheet. The portal's New Enquiry will open it.

If the button is enabled but says there is no sheet published, that
message is correct and means the sheet is not live for that audience.
