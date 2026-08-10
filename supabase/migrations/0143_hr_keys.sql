-- ════════════════════════════════════════════════════════════════
-- 0143 — Human Resources: foreign keys
--
-- All 97, added after 0142 has created every table, so nothing depends
-- on the order the tables were written in.
--
-- ── Safe to run twice ──
--
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each key is dropped
-- first if it is already there. Without that, re-running this file
-- after it stopped part way fails on the first key it had already
-- added, and the fix looks like working out how far it got.
--
-- ON DELETE is deliberately absent rather than defaulted to CASCADE.
-- Deleting a person should not silently take their pay history,
-- absence records and reviews with them — HR data is kept because
-- somebody may have to answer a question about it years later. A delete
-- that is genuinely wanted will fail here and can then be done
-- deliberately.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE "Address" DROP CONSTRAINT IF EXISTS addresses_person_id_fk;
ALTER TABLE "Address" ADD  CONSTRAINT addresses_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Applicant" DROP CONSTRAINT IF EXISTS applicants_hired_as_fk;
ALTER TABLE "Applicant" ADD  CONSTRAINT applicants_hired_as_fk
  FOREIGN KEY ("Hired_As") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS applications_advert_id_fk;
ALTER TABLE "Application" ADD  CONSTRAINT applications_advert_id_fk
  FOREIGN KEY ("Advert_ID") REFERENCES "Job_Advert" ("Job_Advert_ID");
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS applications_applicant_id_fk;
ALTER TABLE "Application" ADD  CONSTRAINT applications_applicant_id_fk
  FOREIGN KEY ("Applicant_ID") REFERENCES "Applicant" ("Applicant_ID");
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS applications_candidate_id_fk;
ALTER TABLE "Application" ADD  CONSTRAINT applications_candidate_id_fk
  FOREIGN KEY ("Candidate_ID") REFERENCES "Candidate" ("Candidate_ID");
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS applications_vacancy_id_fk;
ALTER TABLE "Application" ADD  CONSTRAINT applications_vacancy_id_fk
  FOREIGN KEY ("Vacancy_ID") REFERENCES "Vacancy" ("Vacancy_ID");
ALTER TABLE "Bank_Details" DROP CONSTRAINT IF EXISTS bank_details_person_id_fk;
ALTER TABLE "Bank_Details" ADD  CONSTRAINT bank_details_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Candidate_Attachment" DROP CONSTRAINT IF EXISTS candidate_attachments_candidate_id_fk;
ALTER TABLE "Candidate_Attachment" ADD  CONSTRAINT candidate_attachments_candidate_id_fk
  FOREIGN KEY ("Candidate_ID") REFERENCES "Candidate" ("Candidate_ID");
ALTER TABLE "Candidate" DROP CONSTRAINT IF EXISTS candidates_hired_as_fk;
ALTER TABLE "Candidate" ADD  CONSTRAINT candidates_hired_as_fk
  FOREIGN KEY ("Hired_As") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Contingent_Worker" DROP CONSTRAINT IF EXISTS contingent_workers_agency_id_fk;
ALTER TABLE "Contingent_Worker" ADD  CONSTRAINT contingent_workers_agency_id_fk
  FOREIGN KEY ("Agency_ID") REFERENCES "Recruitment_Agency" ("Recruitment_Agency_ID");
ALTER TABLE "Contingent_Worker" DROP CONSTRAINT IF EXISTS contingent_workers_person_id_fk;
ALTER TABLE "Contingent_Worker" ADD  CONSTRAINT contingent_workers_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "DBS_Check" DROP CONSTRAINT IF EXISTS dbs_checks_person_id_fk;
ALTER TABLE "DBS_Check" ADD  CONSTRAINT dbs_checks_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS departments_parent_id_fk;
ALTER TABLE "Department" ADD  CONSTRAINT departments_parent_id_fk
  FOREIGN KEY ("Parent_ID") REFERENCES "Department" ("Department_ID");
ALTER TABLE "Disciplinary" DROP CONSTRAINT IF EXISTS disciplinaries_interaction_id_fk;
ALTER TABLE "Disciplinary" ADD  CONSTRAINT disciplinaries_interaction_id_fk
  FOREIGN KEY ("Interaction_ID") REFERENCES "Interaction" ("Interaction_ID");
ALTER TABLE "Documents_Log" DROP CONSTRAINT IF EXISTS documents_log_person_id_fk;
ALTER TABLE "Documents_Log" ADD  CONSTRAINT documents_log_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Driving_Licence_Check" DROP CONSTRAINT IF EXISTS driving_licence_checks_person_id_fk;
ALTER TABLE "Driving_Licence_Check" ADD  CONSTRAINT driving_licence_checks_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Accreditation" DROP CONSTRAINT IF EXISTS employee_accreditations_accreditation_type_id_fk;
ALTER TABLE "Employee_Accreditation" ADD  CONSTRAINT employee_accreditations_accreditation_type_id_fk
  FOREIGN KEY ("Accreditation_Type_ID") REFERENCES "Accreditation_Type" ("Accreditation_Type_ID");
ALTER TABLE "Employee_Accreditation" DROP CONSTRAINT IF EXISTS employee_accreditations_person_id_fk;
ALTER TABLE "Employee_Accreditation" ADD  CONSTRAINT employee_accreditations_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Benefit" DROP CONSTRAINT IF EXISTS employee_benefits_benefit_type_id_fk;
ALTER TABLE "Employee_Benefit" ADD  CONSTRAINT employee_benefits_benefit_type_id_fk
  FOREIGN KEY ("Benefit_Type_ID") REFERENCES "Benefit_Type" ("Benefit_Type_ID");
ALTER TABLE "Employee_Benefit" DROP CONSTRAINT IF EXISTS employee_benefits_person_id_fk;
ALTER TABLE "Employee_Benefit" ADD  CONSTRAINT employee_benefits_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Certificate" DROP CONSTRAINT IF EXISTS employee_certificates_certificate_type_id_fk;
ALTER TABLE "Employee_Certificate" ADD  CONSTRAINT employee_certificates_certificate_type_id_fk
  FOREIGN KEY ("Certificate_Type_ID") REFERENCES "Certificate_Type" ("Certificate_Type_ID");
ALTER TABLE "Employee_Certificate" DROP CONSTRAINT IF EXISTS employee_certificates_person_id_fk;
ALTER TABLE "Employee_Certificate" ADD  CONSTRAINT employee_certificates_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Onboarding_Content" DROP CONSTRAINT IF EXISTS employee_onboarding_content_content_id_fk;
ALTER TABLE "Employee_Onboarding_Content" ADD  CONSTRAINT employee_onboarding_content_content_id_fk
  FOREIGN KEY ("Content_ID") REFERENCES "Onboarding_Content" ("Onboarding_Content_ID");
ALTER TABLE "Employee_Onboarding_Content" DROP CONSTRAINT IF EXISTS employee_onboarding_content_person_id_fk;
ALTER TABLE "Employee_Onboarding_Content" ADD  CONSTRAINT employee_onboarding_content_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Onboarding_Task" DROP CONSTRAINT IF EXISTS employee_onboarding_tasks_person_id_fk;
ALTER TABLE "Employee_Onboarding_Task" ADD  CONSTRAINT employee_onboarding_tasks_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Onboarding_Task" DROP CONSTRAINT IF EXISTS employee_onboarding_tasks_task_id_fk;
ALTER TABLE "Employee_Onboarding_Task" ADD  CONSTRAINT employee_onboarding_tasks_task_id_fk
  FOREIGN KEY ("Task_ID") REFERENCES "Onboarding_Task" ("Onboarding_Task_ID");
ALTER TABLE "Employee_Pay" DROP CONSTRAINT IF EXISTS employee_pay_person_id_fk;
ALTER TABLE "Employee_Pay" ADD  CONSTRAINT employee_pay_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Pay" DROP CONSTRAINT IF EXISTS employee_pay_salary_band_id_fk;
ALTER TABLE "Employee_Pay" ADD  CONSTRAINT employee_pay_salary_band_id_fk
  FOREIGN KEY ("Salary_Band_ID") REFERENCES "Salary_Band" ("Salary_Band_ID");
ALTER TABLE "Employee_Role" DROP CONSTRAINT IF EXISTS employee_roles_person_id_fk;
ALTER TABLE "Employee_Role" ADD  CONSTRAINT employee_roles_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Role" DROP CONSTRAINT IF EXISTS employee_roles_role_id_fk;
ALTER TABLE "Employee_Role" ADD  CONSTRAINT employee_roles_role_id_fk
  FOREIGN KEY ("Role_ID") REFERENCES "Job_Role" ("Job_Role_ID");
ALTER TABLE "Employee_Skill" DROP CONSTRAINT IF EXISTS employee_skills_person_id_fk;
ALTER TABLE "Employee_Skill" ADD  CONSTRAINT employee_skills_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employee_Skill" DROP CONSTRAINT IF EXISTS employee_skills_skill_id_fk;
ALTER TABLE "Employee_Skill" ADD  CONSTRAINT employee_skills_skill_id_fk
  FOREIGN KEY ("Skill_ID") REFERENCES "Skill" ("Skill_ID");
ALTER TABLE "Employee_Training" DROP CONSTRAINT IF EXISTS employee_training_course_id_fk;
ALTER TABLE "Employee_Training" ADD  CONSTRAINT employee_training_course_id_fk
  FOREIGN KEY ("Course_ID") REFERENCES "Training_Course" ("Training_Course_ID");
ALTER TABLE "Employee_Training" DROP CONSTRAINT IF EXISTS employee_training_person_id_fk;
ALTER TABLE "Employee_Training" ADD  CONSTRAINT employee_training_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Employment" DROP CONSTRAINT IF EXISTS employment_person_id_fk;
ALTER TABLE "Employment" ADD  CONSTRAINT employment_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Equipment_Assignment" DROP CONSTRAINT IF EXISTS equipment_assignments_equipment_type_id_fk;
ALTER TABLE "Equipment_Assignment" ADD  CONSTRAINT equipment_assignments_equipment_type_id_fk
  FOREIGN KEY ("Equipment_Type_ID") REFERENCES "Equipment_Type" ("Equipment_Type_ID");
ALTER TABLE "Equipment_Assignment" DROP CONSTRAINT IF EXISTS equipment_assignments_person_id_fk;
ALTER TABLE "Equipment_Assignment" ADD  CONSTRAINT equipment_assignments_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Grievance" DROP CONSTRAINT IF EXISTS grievances_interaction_id_fk;
ALTER TABLE "Grievance" ADD  CONSTRAINT grievances_interaction_id_fk
  FOREIGN KEY ("Interaction_ID") REFERENCES "Interaction" ("Interaction_ID");
ALTER TABLE "Headcount_Budget" DROP CONSTRAINT IF EXISTS headcount_budget_department_id_fk;
ALTER TABLE "Headcount_Budget" ADD  CONSTRAINT headcount_budget_department_id_fk
  FOREIGN KEY ("Department_ID") REFERENCES "Department" ("Department_ID");
ALTER TABLE "Hierarchy" DROP CONSTRAINT IF EXISTS hierarchy_manager_id_fk;
ALTER TABLE "Hierarchy" ADD  CONSTRAINT hierarchy_manager_id_fk
  FOREIGN KEY ("Manager_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Hierarchy" DROP CONSTRAINT IF EXISTS hierarchy_person_id_fk;
ALTER TABLE "Hierarchy" ADD  CONSTRAINT hierarchy_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Interaction" DROP CONSTRAINT IF EXISTS interactions_interaction_type_id_fk;
ALTER TABLE "Interaction" ADD  CONSTRAINT interactions_interaction_type_id_fk
  FOREIGN KEY ("Interaction_Type_ID") REFERENCES "Interaction_Type" ("Interaction_Type_ID");
ALTER TABLE "Interaction" DROP CONSTRAINT IF EXISTS interactions_person_id_fk;
ALTER TABLE "Interaction" ADD  CONSTRAINT interactions_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Interview_Stage" DROP CONSTRAINT IF EXISTS interview_stages_application_id_fk;
ALTER TABLE "Interview_Stage" ADD  CONSTRAINT interview_stages_application_id_fk
  FOREIGN KEY ("Application_ID") REFERENCES "Application" ("Application_ID");
ALTER TABLE "Interview_Stage" DROP CONSTRAINT IF EXISTS interview_stages_suggested_vacancy_id_fk;
ALTER TABLE "Interview_Stage" ADD  CONSTRAINT interview_stages_suggested_vacancy_id_fk
  FOREIGN KEY ("Suggested_Vacancy_ID") REFERENCES "Vacancy" ("Vacancy_ID");
ALTER TABLE "Job_Advert" DROP CONSTRAINT IF EXISTS job_adverts_role_id_fk;
ALTER TABLE "Job_Advert" ADD  CONSTRAINT job_adverts_role_id_fk
  FOREIGN KEY ("Role_ID") REFERENCES "Job_Role" ("Job_Role_ID");
ALTER TABLE "Job_Advert" DROP CONSTRAINT IF EXISTS job_adverts_vacancy_id_fk;
ALTER TABLE "Job_Advert" ADD  CONSTRAINT job_adverts_vacancy_id_fk
  FOREIGN KEY ("Vacancy_ID") REFERENCES "Vacancy" ("Vacancy_ID");
ALTER TABLE "Leave_Entitlement" DROP CONSTRAINT IF EXISTS leave_entitlements_leave_type_id_fk;
ALTER TABLE "Leave_Entitlement" ADD  CONSTRAINT leave_entitlements_leave_type_id_fk
  FOREIGN KEY ("Leave_Type_ID") REFERENCES "Leave_Type" ("Leave_Type_ID");
ALTER TABLE "Leave_Entitlement" DROP CONSTRAINT IF EXISTS leave_entitlements_person_id_fk;
ALTER TABLE "Leave_Entitlement" ADD  CONSTRAINT leave_entitlements_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Leave_Request" DROP CONSTRAINT IF EXISTS leave_requests_approved_by_fk;
ALTER TABLE "Leave_Request" ADD  CONSTRAINT leave_requests_approved_by_fk
  FOREIGN KEY ("Approved_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Leave_Request" DROP CONSTRAINT IF EXISTS leave_requests_leave_type_id_fk;
ALTER TABLE "Leave_Request" ADD  CONSTRAINT leave_requests_leave_type_id_fk
  FOREIGN KEY ("Leave_Type_ID") REFERENCES "Leave_Type" ("Leave_Type_ID");
ALTER TABLE "Leave_Request" DROP CONSTRAINT IF EXISTS leave_requests_person_id_fk;
ALTER TABLE "Leave_Request" ADD  CONSTRAINT leave_requests_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Leaver" DROP CONSTRAINT IF EXISTS leavers_leaver_type_id_fk;
ALTER TABLE "Leaver" ADD  CONSTRAINT leavers_leaver_type_id_fk
  FOREIGN KEY ("Leaver_Type_ID") REFERENCES "Leaver_Type" ("Leaver_Type_ID");
ALTER TABLE "Leaver" DROP CONSTRAINT IF EXISTS leavers_linked_disciplinary_fk;
ALTER TABLE "Leaver" ADD  CONSTRAINT leavers_linked_disciplinary_fk
  FOREIGN KEY ("Linked_Disciplinary") REFERENCES "Disciplinary" ("Disciplinary_ID");
ALTER TABLE "Leaver" DROP CONSTRAINT IF EXISTS leavers_person_id_fk;
ALTER TABLE "Leaver" ADD  CONSTRAINT leavers_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Mentoring_Relationship" DROP CONSTRAINT IF EXISTS mentoring_relationships_mentee_id_fk;
ALTER TABLE "Mentoring_Relationship" ADD  CONSTRAINT mentoring_relationships_mentee_id_fk
  FOREIGN KEY ("Mentee_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Mentoring_Relationship" DROP CONSTRAINT IF EXISTS mentoring_relationships_mentor_id_fk;
ALTER TABLE "Mentoring_Relationship" ADD  CONSTRAINT mentoring_relationships_mentor_id_fk
  FOREIGN KEY ("Mentor_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Next_Of_Kin" DROP CONSTRAINT IF EXISTS next_of_kin_person_id_fk;
ALTER TABLE "Next_Of_Kin" ADD  CONSTRAINT next_of_kin_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Objective" DROP CONSTRAINT IF EXISTS objectives_person_id_fk;
ALTER TABLE "Objective" ADD  CONSTRAINT objectives_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Objective" DROP CONSTRAINT IF EXISTS objectives_review_id_fk;
ALTER TABLE "Objective" ADD  CONSTRAINT objectives_review_id_fk
  FOREIGN KEY ("Review_ID") REFERENCES "Performance_Review" ("Performance_Review_ID");
ALTER TABLE "Offer" DROP CONSTRAINT IF EXISTS offers_application_id_fk;
ALTER TABLE "Offer" ADD  CONSTRAINT offers_application_id_fk
  FOREIGN KEY ("Application_ID") REFERENCES "Application" ("Application_ID");
ALTER TABLE "Offer" DROP CONSTRAINT IF EXISTS offers_offered_by_fk;
ALTER TABLE "Offer" ADD  CONSTRAINT offers_offered_by_fk
  FOREIGN KEY ("Offered_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "OH_Referral" DROP CONSTRAINT IF EXISTS oh_referrals_person_id_fk;
ALTER TABLE "OH_Referral" ADD  CONSTRAINT oh_referrals_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "OH_Referral" DROP CONSTRAINT IF EXISTS oh_referrals_referred_by_fk;
ALTER TABLE "OH_Referral" ADD  CONSTRAINT oh_referrals_referred_by_fk
  FOREIGN KEY ("Referred_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Onboarding_Content" DROP CONSTRAINT IF EXISTS onboarding_content_department_id_fk;
ALTER TABLE "Onboarding_Content" ADD  CONSTRAINT onboarding_content_department_id_fk
  FOREIGN KEY ("Department_ID") REFERENCES "Department" ("Department_ID");
ALTER TABLE "Onboarding_Task" DROP CONSTRAINT IF EXISTS onboarding_tasks_department_id_fk;
ALTER TABLE "Onboarding_Task" ADD  CONSTRAINT onboarding_tasks_department_id_fk
  FOREIGN KEY ("Department_ID") REFERENCES "Department" ("Department_ID");
ALTER TABLE "Performance_Review" DROP CONSTRAINT IF EXISTS performance_reviews_conducted_by_fk;
ALTER TABLE "Performance_Review" ADD  CONSTRAINT performance_reviews_conducted_by_fk
  FOREIGN KEY ("Conducted_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Performance_Review" DROP CONSTRAINT IF EXISTS performance_reviews_person_id_fk;
ALTER TABLE "Performance_Review" ADD  CONSTRAINT performance_reviews_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Performance_Review" DROP CONSTRAINT IF EXISTS performance_reviews_reviewer_id_fk;
ALTER TABLE "Performance_Review" ADD  CONSTRAINT performance_reviews_reviewer_id_fk
  FOREIGN KEY ("Reviewer_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Person_Document" DROP CONSTRAINT IF EXISTS person_documents_person_id_fk;
ALTER TABLE "Person_Document" ADD  CONSTRAINT person_documents_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Person_Document" DROP CONSTRAINT IF EXISTS person_documents_verified_by_fk;
ALTER TABLE "Person_Document" ADD  CONSTRAINT person_documents_verified_by_fk
  FOREIGN KEY ("Verified_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "PIP_Record" DROP CONSTRAINT IF EXISTS pip_records_conducted_by_fk;
ALTER TABLE "PIP_Record" ADD  CONSTRAINT pip_records_conducted_by_fk
  FOREIGN KEY ("Conducted_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "PIP_Record" DROP CONSTRAINT IF EXISTS pip_records_person_id_fk;
ALTER TABLE "PIP_Record" ADD  CONSTRAINT pip_records_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Referee" DROP CONSTRAINT IF EXISTS referees_candidate_id_fk;
ALTER TABLE "Referee" ADD  CONSTRAINT referees_candidate_id_fk
  FOREIGN KEY ("Candidate_ID") REFERENCES "Candidate" ("Candidate_ID");
ALTER TABLE "Return_To_Work_Form" DROP CONSTRAINT IF EXISTS return_to_work_forms_conducted_by_fk;
ALTER TABLE "Return_To_Work_Form" ADD  CONSTRAINT return_to_work_forms_conducted_by_fk
  FOREIGN KEY ("Conducted_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Return_To_Work_Form" DROP CONSTRAINT IF EXISTS return_to_work_forms_person_id_fk;
ALTER TABLE "Return_To_Work_Form" ADD  CONSTRAINT return_to_work_forms_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Return_To_Work_Form" DROP CONSTRAINT IF EXISTS return_to_work_forms_sickness_record_id_fk;
ALTER TABLE "Return_To_Work_Form" ADD  CONSTRAINT return_to_work_forms_sickness_record_id_fk
  FOREIGN KEY ("Sickness_Record_ID") REFERENCES "Sickness_Record" ("Sickness_Record_ID");
ALTER TABLE "Job_Role" DROP CONSTRAINT IF EXISTS roles_department_id_fk;
ALTER TABLE "Job_Role" ADD  CONSTRAINT roles_department_id_fk
  FOREIGN KEY ("Department_ID") REFERENCES "Department" ("Department_ID");
ALTER TABLE "Job_Role" DROP CONSTRAINT IF EXISTS roles_job_title_id_fk;
ALTER TABLE "Job_Role" ADD  CONSTRAINT roles_job_title_id_fk
  FOREIGN KEY ("Job_Title_ID") REFERENCES "Job_Title" ("Job_Title_ID");
ALTER TABLE "Job_Role" DROP CONSTRAINT IF EXISTS roles_salary_band_id_fk;
ALTER TABLE "Job_Role" ADD  CONSTRAINT roles_salary_band_id_fk
  FOREIGN KEY ("Salary_Band_ID") REFERENCES "Salary_Band" ("Salary_Band_ID");
ALTER TABLE "Sickness_Record" DROP CONSTRAINT IF EXISTS sickness_records_interaction_id_fk;
ALTER TABLE "Sickness_Record" ADD  CONSTRAINT sickness_records_interaction_id_fk
  FOREIGN KEY ("Interaction_ID") REFERENCES "Interaction" ("Interaction_ID");
ALTER TABLE "Sickness_Record" DROP CONSTRAINT IF EXISTS sickness_records_sickness_category_id_fk;
ALTER TABLE "Sickness_Record" ADD  CONSTRAINT sickness_records_sickness_category_id_fk
  FOREIGN KEY ("Sickness_Category_ID") REFERENCES "Sickness_Category" ("Sickness_Category_ID");
ALTER TABLE "Skill" DROP CONSTRAINT IF EXISTS skills_category_id_fk;
ALTER TABLE "Skill" ADD  CONSTRAINT skills_category_id_fk
  FOREIGN KEY ("Category_ID") REFERENCES "Skill_Category" ("Skill_Category_ID");
ALTER TABLE "Succession_Plan" DROP CONSTRAINT IF EXISTS succession_plans_primary_successor_id_fk;
ALTER TABLE "Succession_Plan" ADD  CONSTRAINT succession_plans_primary_successor_id_fk
  FOREIGN KEY ("Primary_Successor_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Succession_Plan" DROP CONSTRAINT IF EXISTS succession_plans_role_id_fk;
ALTER TABLE "Succession_Plan" ADD  CONSTRAINT succession_plans_role_id_fk
  FOREIGN KEY ("Role_ID") REFERENCES "Job_Role" ("Job_Role_ID");
ALTER TABLE "Succession_Plan" DROP CONSTRAINT IF EXISTS succession_plans_secondary_successor_id_fk;
ALTER TABLE "Succession_Plan" ADD  CONSTRAINT succession_plans_secondary_successor_id_fk
  FOREIGN KEY ("Secondary_Successor_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Timesheet_Entry" DROP CONSTRAINT IF EXISTS timesheet_entries_timesheet_id_fk;
ALTER TABLE "Timesheet_Entry" ADD  CONSTRAINT timesheet_entries_timesheet_id_fk
  FOREIGN KEY ("Timesheet_ID") REFERENCES "Timesheet" ("Timesheet_ID");
ALTER TABLE "Timesheet" DROP CONSTRAINT IF EXISTS timesheets_approved_by_fk;
ALTER TABLE "Timesheet" ADD  CONSTRAINT timesheets_approved_by_fk
  FOREIGN KEY ("Approved_By") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Timesheet" DROP CONSTRAINT IF EXISTS timesheets_person_id_fk;
ALTER TABLE "Timesheet" ADD  CONSTRAINT timesheets_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Vacancy" DROP CONSTRAINT IF EXISTS vacancies_department_id_fk;
ALTER TABLE "Vacancy" ADD  CONSTRAINT vacancies_department_id_fk
  FOREIGN KEY ("Department_ID") REFERENCES "Department" ("Department_ID");
ALTER TABLE "Vacancy" DROP CONSTRAINT IF EXISTS vacancies_hiring_manager_id_fk;
ALTER TABLE "Vacancy" ADD  CONSTRAINT vacancies_hiring_manager_id_fk
  FOREIGN KEY ("Hiring_Manager_ID") REFERENCES "Person" ("Person_ID");
ALTER TABLE "Vacancy" DROP CONSTRAINT IF EXISTS vacancies_job_title_id_fk;
ALTER TABLE "Vacancy" ADD  CONSTRAINT vacancies_job_title_id_fk
  FOREIGN KEY ("Job_Title_ID") REFERENCES "Job_Title" ("Job_Title_ID");
ALTER TABLE "Vacancy" DROP CONSTRAINT IF EXISTS vacancies_office_location_id_fk;
ALTER TABLE "Vacancy" ADD  CONSTRAINT vacancies_office_location_id_fk
  FOREIGN KEY ("Office_Location_ID") REFERENCES "Office_Location" ("Office_Location_ID");
ALTER TABLE "Vacancy" DROP CONSTRAINT IF EXISTS vacancies_salary_band_id_fk;
ALTER TABLE "Vacancy" ADD  CONSTRAINT vacancies_salary_band_id_fk
  FOREIGN KEY ("Salary_Band_ID") REFERENCES "Salary_Band" ("Salary_Band_ID");
ALTER TABLE "Working_Pattern" DROP CONSTRAINT IF EXISTS working_patterns_person_id_fk;
ALTER TABLE "Working_Pattern" ADD  CONSTRAINT working_patterns_person_id_fk
  FOREIGN KEY ("Person_ID") REFERENCES "Person" ("Person_ID");

-- The two keys `people` carried, now on Person.
ALTER TABLE "Person" DROP CONSTRAINT IF EXISTS person_office_location_id_fk;
ALTER TABLE "Person" ADD  CONSTRAINT person_office_location_id_fk
  FOREIGN KEY ("Office_Location_ID") REFERENCES "Office_Location" ("Office_Location_ID");
ALTER TABLE "Person" DROP CONSTRAINT IF EXISTS person_department_id_fk;
ALTER TABLE "Person" ADD  CONSTRAINT person_department_id_fk
  FOREIGN KEY ("Department_ID") REFERENCES "Department" ("Department_ID");
