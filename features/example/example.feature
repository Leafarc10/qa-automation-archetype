@ui @regression
Feature: Example application
  As a QA engineer using the QA Automation Archetype
  I want a minimal, working example that opens a public demo page
  So that I can see how Feature -> Step -> CustomWorld -> Page -> Component fit together

  @smoke
  Scenario: The homepage shows the expected heading and call to action
    Given I open the example application
    Then I should see a heading that mentions "Playwright"
    And the "Get started" link should be visible

  Scenario: The main navigation exposes the documentation link
    Given I open the example application
    Then the main navigation should be visible
    And the main navigation should include a "Docs" link
