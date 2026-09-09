@ui @regression
Feature: SauceDemo checkout
  As a shopper on SauceDemo
  I want to complete the purchase of a product
  So that I can validate the end-to-end checkout flow

  @smoke
  Scenario: Complete checkout for a single product
    Given I log in to SauceDemo as "standard_user" with password "secret_sauce"
    When I add "Sauce Labs Backpack" to the cart
    Then the cart badge should show "1"
    When I open the cart
    Then I should see "Sauce Labs Backpack" in the cart
    When I proceed to checkout
    And I fill in the checkout information with first name "QA", last name "Automation" and postal code "1000"
    And I continue to the checkout overview
    Then I should see "Sauce Labs Backpack" in the checkout overview
    And the price summary should be present
    When I finish the checkout
    Then I should see the order confirmation message "Thank you for your order!"

  Scenario: Postal code is required to continue checkout
    Given I log in to SauceDemo as "standard_user" with password "secret_sauce"
    When I add "Sauce Labs Backpack" to the cart
    And I open the cart
    And I proceed to checkout
    And I fill in the checkout information with first name "QA", last name "Automation" and postal code ""
    And I continue to the checkout overview
    Then I should remain on the checkout information form
    And I should see the checkout information error "Error: Postal Code is required"
