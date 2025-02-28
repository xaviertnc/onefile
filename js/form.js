/* global F1 */

/* form.js */

(function(F1) {

  /**
   * F1 Form - 07 Oct 2022
   * 
   * @author  C. Moller <xavier.tnc@gmail.com>
   * 
   * @version 3.3 - FT - 23 Feb 2024
   *   - Add validateOnSubmit()
   * 
   * @version 3.4 - FT - 18 Jan 2025
   *   - Add getInputFieldType()
   *   - Add getDefaultFieldType()
   *   - Add addCustomValidation()
   *   - Update getFields() to use getInputFieldType()
   * 
   * @version 3.4 - FT - 18 Jan 2025
   *   - Move "getting" the field's element from getInputFieldType() to getFields() to
   *     enable adding the field's element to the FieldType constructor.
   * 
   * @version 3.5 - FT - 25 Feb 2025
   *   - Add getFieldElement() to handle special fields like
   *     checkable options and/or groups, where the field element is 
   *     NOT the same as the input element.
   */

  function log(...args) { if (F1.DEBUG > 2) console.log(...args); }

  class Form {

    constructor(formElement, config = {}) {
      const defaultConfig = {
        validateOnSubmit: function() { return true; },
        customValidations: {},
        customFieldTypes: {},
        stopOnInvalid: false,
        checkModified: true,
        initialValues: null,
      };
      Object.assign(this, defaultConfig, config);
      formElement.CONTROLLER = this;
      this.formElement = formElement;
      this.formElements = Array.from(formElement.elements);
      this.fields = this.getFields();
      // this.fields.forEach(field => field.init());
      this.fieldNames = Object.keys(this.fields);
      this.defaultValues = Object.assign(this.getValues('init-bootstrap'), this.initialValues);
      this.setValues(this.defaultValues, 'init-bootstrap');
      this.attachEventListeners();
      this.onInit && this.onInit();
    }

    getFieldElement(input) {
      if (input?.dataset?.customType) return input; // The custom controller should update the element if necessary.
      const isCheckableOption = (input.type === 'radio') || (input.type === 'checkbox');
      const isOptionGroup = isCheckableOption && input.form.elements[input.name].length > 1;
      return isOptionGroup ? input.closest('fieldset') || input.parentElement : input;
    }    

    getInputFieldType(input, fieldElement) {
      log('getInputFieldType', { input, fieldElement });
      return fieldElement?.dataset?.customType || this.getDefaultFieldType(input);
    }

    getDefaultFieldType(input) {
      const type = input?.type || 'text';
      return 'F1' + type.charAt(0).toUpperCase() + type.slice(1) + 'Field';
    }

    getFields() {
      const fields = {};
      this.formElements.filter(this.validatable).forEach(input => {
        if (fields[input.name]) return fields[input.name].inputs.push(input);
        const fieldElement = this.getFieldElement(input);
        const fieldTypeName = this.getInputFieldType(input, fieldElement);
        const FieldType = this.customFieldTypes[fieldTypeName] || F1.lib.FormField;
        const field = new FieldType(this, input, fieldTypeName, fieldElement);
        log('getFields(), Field for input:', input.name, field);
        fields[field.name] = field;
      });
      return fields;
    }

    validatable(el) {
      return el.form && el.name && (el.tagName === 'INPUT' && el.type !== 'submit' 
        && el.type !== 'reset') || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
    }

    handleSubmit(e) {
      e.preventDefault();
      log('handleSubmit', { form: this, event: e });
      if (this.onBeforeSubmit?.(e) === false) return;
      let firstInvalidField = null, formValid = true;
      if (this.validateOnSubmit()) {
        for (const field of Object.values(this.fields)) {
          const isValid = field.validate();
          log('sumitting field', { field: field.name, isValid });
          field.updateValidationUi(isValid);
          if (isValid) continue;
          formValid = false;
          if (!firstInvalidField) firstInvalidField = field;
          if (this.stopOnInvalid) break;
        }
      }
      if (this.onSubmit?.(e, formValid, firstInvalidField) === false) return;
      if (!formValid) return firstInvalidField && this.gotoField(firstInvalidField);
    }

    handleChange(e) {
      log('handleChange:', e.target.name);
      if (!this.fields[e.target.name]) return;
      const field = this.fields[e.target.name];
      const isValid = field.validate();
      field.updateValidationUi(isValid);
      if (this.checkModified) {
        const isModified = field.isModified();
        field.updateModifiedUi(isModified);
      }
    }

    handleKeyDown(e) {
      log('Form: handleKeyDown', e.target.name, e.target, e);
      if (e.key !== 'Enter') return;
      if (!this.fields[e.target.name]) return;
      const field = this.fields[e.target.name];
      if (field.handleKeyDown && field.handleKeyDown(e) === false) return;
      e.preventDefault(); this.focusNextField(field);
    }

    addCustomValidation(fieldName, fn) { 
      if (!this.customValidations[fieldName]) this.customValidations[fieldName] = [];
      this.customValidations[fieldName].push(fn);
    }

    attachEventListeners() {
      this.formElement.addEventListener('submit', this.handleSubmit.bind(this));
      this.formElement.addEventListener('change', this.handleChange.bind(this));
      this.formElement.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    clearValidationUi() { Object.values(this.fields).forEach(field => field.clearValidationUi()); }

    focusNextField(currentField) {
      const currentIndex = this.fieldNames.indexOf(currentField.name);
      const nextField = this.fields[this.fieldNames[currentIndex + 1]];
      console.log('focusNextField:', { currentField, nextField });
      if (nextField) nextField.focus();
    }

    gotoFirstField() {
      const firstField = this.fields[this.fieldNames[0]];
      log('going to first field');
      this.gotoField(firstField);
    }

    gotoField(field) {
      log('goto field', field);
      field.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      field.focus();
    }

    setValues(values, init = false) {
      log('setValues', values);
      Object.keys(values).forEach(name => {
        const field = this.fields[name];
        if (field) field.setValue(values[name], init);
      });
    }

    getValues(bootstrap) {
      log('getValues');
      const values = {};
      this.fieldNames.forEach(name => values[name] = this.fields[name].getValue(bootstrap));
      return values;
    }

    isModified() {
      return this.checkModified && Object.values(this.fields).some(field => field.isModified());
    }

    restart(initialValues = null, init = true) {
      log('restart form:', initialValues);
      Object.values(this.fields).forEach(field => field.clearValidationUi());
      this.setValues(initialValues || this.defaultValues, init);
    }

    clear() {
      log('clear form');
      Object.values(this.fields).forEach(field => field.clear());
    }

  }

  F1.lib = F1.lib || {};
  F1.lib.Form = Form;

})(window.F1 = window.F1 || {});