/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import Schemas from "metabase/entities/schemas";
import Search from "metabase/entities/search";
import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import { getHasDataAccess } from "metabase/selectors/data";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/selectors/settings";
import { Box, Popover } from "metabase/ui";
import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";

import DataBucketPicker from "./DataSelectorDataBucketPicker";
import DatabasePicker from "./DataSelectorDatabasePicker";
import DatabaseSchemaPicker from "./DataSelectorDatabaseSchemaPicker";
import FieldPicker from "./DataSelectorFieldPicker";
import SchemaPicker from "./DataSelectorSchemaPicker";
import TablePicker from "./DataSelectorTablePicker";
import {
  DatabaseTrigger,
  FieldTrigger,
  TableTrigger,
  Trigger,
} from "./TriggerComponents";
import { CONTAINER_WIDTH, DATA_BUCKET } from "./constants";
import SavedEntityPicker from "./saved-entity-picker/SavedEntityPicker";
import { getDataTypes } from "./utils";

// chooses a data source bucket (datasets / raw data (tables) / saved questions)
const DATA_BUCKET_STEP = "BUCKET";
// chooses a database
const DATABASE_STEP = "DATABASE";
// chooses a schema (given that a database has already been selected)
const SCHEMA_STEP = "SCHEMA";
// chooses a table (database has already been selected)
const TABLE_STEP = "TABLE";
// chooses a table field (table has already been selected)
const FIELD_STEP = "FIELD";

export function DataSourceSelector(props) {
  return (
    <DataSelector
      steps={[DATA_BUCKET_STEP, DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
      combineDatabaseSchemaSteps
      getTriggerElementContent={TableTrigger}
      {...props}
    />
  );
}

export function DatabaseDataSelector(props) {
  return (
    <DataSelector
      steps={[DATABASE_STEP]}
      getTriggerElementContent={DatabaseTrigger}
      {...props}
    />
  );
}

export function DatabaseSchemaAndTableDataSelector(props) {
  return (
    <DataSelector
      steps={[DATABASE_STEP, SCHEMA_STEP, TABLE_STEP]}
      combineDatabaseSchemaSteps
      getTriggerElementContent={TableTrigger}
      {...props}
    />
  );
}

export function SchemaAndTableDataSelector(props) {
  return (
    <DataSelector
      steps={[SCHEMA_STEP, TABLE_STEP]}
      getTriggerElementContent={TableTrigger}
      {...props}
    />
  );
}

export function SchemaTableAndFieldDataSelector(props) {
  return (
    <DataSelector
      steps={[SCHEMA_STEP, TABLE_STEP, FIELD_STEP]}
      getTriggerElementContent={FieldTrigger}
      // We don't want to change styles when there's a different trigger element
      isMantine={!props.getTriggerElementContent}
      {...props}
    />
  );
}

export function FieldDataSelector(props) {
  return (
    <DataSelector
      steps={[FIELD_STEP]}
      getTriggerElementContent={FieldTrigger}
      {...props}
    />
  );
}

export class UnconnectedDataSelector extends Component {
  constructor(props) {
    super();

    const state = {
      selectedDataBucketId: props.selectedDataBucketId,
      selectedDatabaseId: props.selectedDatabaseId,
      selectedSchemaId: props.selectedSchemaId,
      selectedTableId: props.selectedTableId,
      selectedFieldId: props.selectedFieldId,
      isSavedEntityPickerShown: false,
      savedEntityType: null,
      isPopoverOpen: props.isInitiallyOpen && !props.readOnly,
    };
    const computedState = this._getComputedState(props, state);
    this.state = {
      activeStep: null,
      isLoading: false,
      isError: false,
      ...state,
      ...computedState,
    };
  }

  static propTypes = {
    selectedDataBucketId: PropTypes.string,
    selectedDatabaseId: PropTypes.number,
    selectedSchemaId: PropTypes.string,
    selectedTableId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    selectedFieldId: PropTypes.number,
    databases: PropTypes.array.isRequired,
    setDatabaseFn: PropTypes.func,
    setFieldFn: PropTypes.func,
    setSourceTableFn: PropTypes.func,
    hideSingleSchema: PropTypes.bool,
    hideSingleDatabase: PropTypes.bool,
    useOnlyAvailableDatabase: PropTypes.bool,
    useOnlyAvailableSchema: PropTypes.bool,
    isInitiallyOpen: PropTypes.bool,
    tableFilter: PropTypes.func,
    fieldFilter: PropTypes.func,
    canChangeDatabase: PropTypes.bool,
    containerClassName: PropTypes.string,
    canSelectModel: PropTypes.bool,
    canSelectTable: PropTypes.bool,
    canSelectMetric: PropTypes.bool,
    canSelectSavedQuestion: PropTypes.bool,

    // from search entity list loader
    allError: PropTypes.bool,
    allFetched: PropTypes.bool,
    allLoaded: PropTypes.bool,
    allLoading: PropTypes.bool,
    loaded: PropTypes.bool,
    loading: PropTypes.bool,
    fetched: PropTypes.bool,
    fetch: PropTypes.func,
    create: PropTypes.func,
    update: PropTypes.func,
    delete: PropTypes.func,
    reload: PropTypes.func,
    list: PropTypes.arrayOf(PropTypes.object),
    allDatabases: PropTypes.arrayOf(PropTypes.object),
  };

  static defaultProps = {
    isInitiallyOpen: false,
    useOnlyAvailableDatabase: true,
    useOnlyAvailableSchema: true,
    hideSingleSchema: true,
    hideSingleDatabase: false,
    canChangeDatabase: true,
    hasTriggerExpandControl: true,
    isPopover: true,
    isMantine: false,
    canSelectModel: true,
    canSelectTable: true,
    canSelectMetric: false,
    canSelectSavedQuestion: true,
  };

  isPopoverOpen() {
    // If the isOpen prop is passed in, use the controlled value.
    if (typeof this.props.isOpen === "boolean") {
      return this.props.isOpen;
    }

    // Otherwise, use the internal popover state.
    return this.state.isPopoverOpen;
  }

  // computes selected metadata objects (`selectedDatabase`, etc) and options (`databases`, etc)
  // from props (`metadata`, `databases`, etc) and state (`selectedDatabaseId`, etc)
  //
  // NOTE: this is complicated because we allow you to:
  // 1. pass in databases/schemas/tables/fields as props
  // 2. pull them from the currently selected "parent" metadata object
  // 3. pull them out of metadata
  //
  // We also want to recompute the selected objects from their selected ID
  // each time rather than storing the object itself in case new metadata is
  // asynchronously loaded
  //
  _getComputedState(props, state) {
    const { metadata, tableFilter, fieldFilter } = props;
    const {
      selectedDatabaseId,
      selectedSchemaId,
      selectedTableId,
      selectedFieldId,
    } = state;

    let { databases, schemas, tables, fields } = props;
    let selectedDatabase = null,
      selectedSchema = null,
      selectedTable = null,
      selectedField = null;

    const getDatabase = (id) =>
      _.findWhere(databases, { id }) || metadata.database(id);
    const getSchema = (id) =>
      _.findWhere(schemas, { id }) || metadata.schema(id);
    const getTable = (id) => _.findWhere(tables, { id }) || metadata.table(id);
    const getField = (id) => _.findWhere(fields, { id }) || metadata.field(id);

    function setSelectedDatabase(database) {
      selectedDatabase = database;
      if (!schemas && database) {
        schemas = database.schemas;
      }
      if (!tables && Array.isArray(schemas) && schemas.length === 1) {
        tables = schemas[0].tables;
      }
    }

    function setSelectedSchema(schema) {
      selectedSchema = schema;
      if (!tables && schema) {
        tables = schema.tables;
      }
    }

    function setSelectedTable(table) {
      selectedTable = table;
      if (!fields && table) {
        fields = table.fields;
      }
    }

    function setSelectedField(field) {
      selectedField = field;
    }

    if (selectedDatabaseId != null) {
      setSelectedDatabase(getDatabase(selectedDatabaseId));
    }
    if (selectedSchemaId != null && selectedDatabaseId) {
      setSelectedSchema(getSchema(selectedSchemaId));
    }
    if (selectedTableId != null) {
      setSelectedTable(getTable(selectedTableId));
    }
    if (selectedFieldId != null) {
      setSelectedField(getField(selectedFieldId));
    }
    // now do it in in reverse to propagate it back up
    if (!selectedTable && selectedField) {
      setSelectedTable(selectedField.table);
    }
    if (!selectedSchema && selectedTable) {
      setSelectedSchema(selectedTable.schema);
    }
    if (!selectedDatabase && selectedSchema) {
      setSelectedDatabase(selectedSchema.database);
    }

    if (tables && tableFilter) {
      tables = tables.filter(tableFilter);
    }

    if (fields && fieldFilter) {
      fields = fields.filter(fieldFilter);
    }

    return {
      databases: databases || [],
      selectedDatabase: selectedDatabase,
      schemas: schemas || [],
      selectedSchema: selectedSchema,
      tables: tables || [],
      selectedTable: selectedTable,
      fields: fields || [],
      selectedField: selectedField,
    };
  }

  // Like setState, but automatically adds computed state so we don't have to recalculate
  // repeatedly. Also returns a promise resolves after state is updated
  setStateWithComputedState(newState, newProps = this.props) {
    return new Promise((resolve) => {
      const computedState = this._getComputedState(newProps, {
        ...this.state,
        ...newState,
      });
      this.setState({ ...newState, ...computedState }, resolve);
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const newState = {};
    for (const propName of [
      "selectedDatabaseId",
      "selectedSchemaId",
      "selectedTableId",
      "selectedFieldId",
    ]) {
      if (
        nextProps[propName] !== this.props[propName] &&
        this.state[propName] !== nextProps[propName]
      ) {
        newState[propName] = nextProps[propName];
      }
    }
    if (Object.keys(newState).length > 0) {
      this.setStateWithComputedState(newState, nextProps);
    } else if (nextProps.metadata !== this.props.metadata) {
      this.setStateWithComputedState({}, nextProps);
    }
  }

  async componentDidMount() {
    const { activeStep } = this.state;
    const {
      fetchFields,
      fetchQuestion,
      selectedDataBucketId,
      selectedTableId: sourceId,
    } = this.props;

    if (!this.isSearchLoading() && !activeStep) {
      await this.hydrateActiveStep();
    }

    if (selectedDataBucketId === DATA_BUCKET.MODELS) {
      this.showSavedEntityPicker({ entityType: "model" });
    }

    if (sourceId) {
      await fetchFields(sourceId);
      if (this.isSavedEntitySelected()) {
        await fetchQuestion(sourceId);

        this.showSavedEntityPicker({
          entityType: this.props.selectedQuestion?.type(),
        });
      }
    }
  }

  async componentDidUpdate(prevProps) {
    const { allLoading } = this.props;
    const loadedDatasets = prevProps.allLoading && !allLoading;

    // Once datasets are queried with the search endpoint,
    // this would hide the initial loading and view.
    // If there is at least one dataset, DATA_BUCKER_STEP will be shown,
    // otherwise, the picker will jump to the next step and present the regular picker
    if (loadedDatasets) {
      await this.hydrateActiveStep();
    }

    // this logic cleans up invalid states, e.x. if a selectedSchema's database
    // doesn't match selectedDatabase we clear it and go to the SCHEMA_STEP
    const {
      activeStep,
      selectedDatabase,
      selectedSchema,
      selectedTable,
      selectedField,
    } = this.state;

    const invalidSchema =
      selectedDatabase &&
      selectedSchema &&
      selectedSchema.database &&
      selectedSchema.database.id !== selectedDatabase.id &&
      selectedSchema.database.id !== SAVED_QUESTIONS_VIRTUAL_DB_ID;

    const onStepMissingSchemaAndTable =
      !selectedSchema &&
      !selectedTable &&
      (activeStep === TABLE_STEP || activeStep === FIELD_STEP);

    const onStepMissingTable = !selectedTable && activeStep === FIELD_STEP;

    const invalidTable =
      selectedSchema &&
      selectedTable &&
      !isVirtualCardId(selectedTable.id) &&
      selectedTable.schema.id !== selectedSchema.id;

    const invalidField =
      selectedTable &&
      selectedField &&
      selectedField.table.id !== selectedTable.id;

    if (invalidSchema || onStepMissingSchemaAndTable) {
      await this.switchToStep(SCHEMA_STEP, {
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      });
    } else if (invalidTable || onStepMissingTable) {
      await this.switchToStep(TABLE_STEP, {
        selectedTableId: null,
        selectedFieldId: null,
      });
    } else if (invalidField) {
      await this.switchToStep(FIELD_STEP, { selectedFieldId: null });
    }
  }

  isSearchLoading = () => {
    // indicates status of API request triggered by Search.loadList
    return this.props.loading;
  };

  getCardType() {
    const { selectedDataBucketId, savedEntityType } = this.state;
    switch (true) {
      case selectedDataBucketId === DATA_BUCKET.MODELS ||
        savedEntityType === "model":
        return "model";
      case selectedDataBucketId === DATA_BUCKET.METRICS ||
        savedEntityType === "metric":
        return "metric";
      default:
        return "question";
    }
  }

  hasModels = () => {
    const { availableModels, canSelectModel, loaded } = this.props;
    return loaded && canSelectModel && availableModels.includes("dataset");
  };

  hasUsableModels = () => {
    // As models are actually saved questions, nested queries must be enabled
    return this.hasModels() && this.props.hasNestedQueriesEnabled;
  };

  hasMetrics = () => {
    const { availableModels, canSelectMetric, loaded } = this.props;
    return loaded && canSelectMetric && availableModels.includes("metric");
  };

  hasUsableMetrics = () => {
    // As metrics are actually saved questions, nested queries must be enabled
    return this.hasMetrics() && this.props.hasNestedQueriesEnabled;
  };

  hasUsableModelsOrMetrics = () => {
    return this.hasUsableModels() || this.hasUsableMetrics();
  };

  hasSavedQuestions = () => {
    const { canSelectSavedQuestion } = this.props;
    return (
      this.state.databases.some((database) => database.is_saved_questions) &&
      canSelectSavedQuestion
    );
  };

  getDatabases = () => {
    const { databases } = this.state;

    // When there is at least one dataset,
    // "Saved Questions" are presented in a different picker step
    // So it should be excluded from a regular databases list
    const shouldRemoveSavedQuestionDatabaseFromList =
      !this.props.hasNestedQueriesEnabled ||
      this.hasUsableModelsOrMetrics() ||
      !this.props.canSelectSavedQuestion;

    return shouldRemoveSavedQuestionDatabaseFromList
      ? databases.filter((db) => !db.is_saved_questions)
      : databases;
  };

  async hydrateActiveStep() {
    const { steps } = this.props;
    if (
      this.isSavedEntitySelected() ||
      this.state.selectedDataBucketId === DATA_BUCKET.MODELS ||
      this.state.selectedDataBucketId === DATA_BUCKET.SAVED_QUESTIONS
    ) {
      await this.switchToStep(DATABASE_STEP);
    } else if (this.state.selectedTableId && steps.includes(FIELD_STEP)) {
      await this.switchToStep(FIELD_STEP);
    } else if (
      // Schema id is explicitly set when going through the New > Question/Model flow,
      // whereas we have to obtain it from the state when opening a saved question.
      (this.state.selectedSchemaId || this.state.selectedSchema?.id) &&
      steps.includes(TABLE_STEP)
    ) {
      await this.switchToStep(TABLE_STEP);
    } else if (this.state.selectedDatabaseId && steps.includes(SCHEMA_STEP)) {
      await this.switchToStep(SCHEMA_STEP);
    } else if (
      steps[0] === DATA_BUCKET_STEP &&
      !this.hasUsableModelsOrMetrics()
    ) {
      await this.switchToStep(steps[1]);
    } else {
      await this.switchToStep(steps[0]);
    }
  }

  // for steps where there's a single option sometimes we want to automatically select it
  // if `useOnlyAvailable*` prop is provided
  skipSteps() {
    const { readOnly } = this.props;
    const { activeStep } = this.state;

    if (readOnly) {
      return;
    }

    if (
      activeStep === DATABASE_STEP &&
      this.props.useOnlyAvailableDatabase &&
      this.props.selectedDatabaseId == null
    ) {
      const databases = this.getDatabases();
      if (databases && databases.length === 1) {
        this.onChangeDatabase(databases[0]);
      }
    }
    if (
      activeStep === SCHEMA_STEP &&
      this.props.useOnlyAvailableSchema &&
      this.props.selectedSchemaId == null
    ) {
      const { schemas } = this.state;
      if (schemas && schemas.length === 1) {
        this.onChangeSchema(schemas[0]);
      }
    }
  }

  getNextStep() {
    const { steps } = this.props;
    const index = steps.indexOf(this.state.activeStep);
    return index < steps.length - 1 ? steps[index + 1] : null;
  }

  getPreviousStep() {
    const { steps } = this.props;
    const { activeStep } = this.state;
    if (this.isSearchLoading() || activeStep === null) {
      return null;
    }

    let index = steps.indexOf(activeStep);
    if (index === -1) {
      console.error(`Step ${activeStep} not found in ${steps}.`);
      return null;
    }

    // move to previous step
    index -= 1;

    // possibly skip another step backwards
    if (
      steps[index] === SCHEMA_STEP &&
      this.props.useOnlyAvailableSchema &&
      this.state.schemas.length === 1
    ) {
      index -= 1;
    }

    // data bucket step doesn't make a lot of sense when there're no models or metrics
    if (steps[index] === DATA_BUCKET_STEP && !this.hasUsableModelsOrMetrics()) {
      return null;
    }

    // can't go back to a previous step
    if (index < 0) {
      return null;
    }
    return steps[index];
  }

  togglePopoverOpen = () => {
    this.setStateWithComputedState({
      isPopoverOpen: !this.state.isPopoverOpen,
    });
  };

  nextStep = async (stateChange = {}, skipSteps = true) => {
    const nextStep = this.getNextStep();
    if (!nextStep) {
      await this.setStateWithComputedState({
        ...stateChange,
        isPopoverOpen: !this.state.isPopoverOpen,
      });
    } else {
      await this.switchToStep(nextStep, stateChange, skipSteps);
    }
  };

  previousStep = () => {
    const previousStep = this.getPreviousStep();
    if (previousStep) {
      const clearedState = this.getClearedStateForStep(previousStep);
      this.switchToStep(previousStep, clearedState, false);
    }
  };

  getClearedStateForStep(step) {
    if (step === DATA_BUCKET_STEP) {
      return {
        selectedDataBucketId: null,
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === DATABASE_STEP) {
      return {
        selectedDatabaseId: null,
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === SCHEMA_STEP) {
      return {
        selectedSchemaId: null,
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === TABLE_STEP) {
      return {
        selectedTableId: null,
        selectedFieldId: null,
      };
    } else if (step === FIELD_STEP) {
      return {
        selectedFieldId: null,
      };
    }
    return {};
  }

  async loadStepData(stepName) {
    const loadersForSteps = {
      // NOTE: make sure to return the action's resulting promise
      [DATA_BUCKET_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.props.fetchDatabases({ saved: true }),
        ]);
      },
      [DATABASE_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.props.fetchDatabases({ saved: true }),
        ]);
      },
      [SCHEMA_STEP]: () => {
        return Promise.all([
          this.props.fetchDatabases(this.props.databaseQuery),
          this.props.fetchSchemas(this.state.selectedDatabaseId),
        ]);
      },
      [TABLE_STEP]: () => {
        if (this.state.selectedSchemaId != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchemaId);
        } else if (this.state.selectedSchema?.id != null) {
          return this.props.fetchSchemaTables(this.state.selectedSchema?.id);
        }
      },
      [FIELD_STEP]: () => {
        if (this.state.selectedTableId != null) {
          return this.props.fetchFields(this.state.selectedTableId);
        }
      },
    };

    if (loadersForSteps[stepName]) {
      try {
        await this.setStateWithComputedState({
          isLoading: true,
          isError: false,
        });
        await loadersForSteps[stepName]();
        await this.setStateWithComputedState({
          isLoading: false,
          isError: false,
        });
      } catch (e) {
        await this.setStateWithComputedState({
          isLoading: false,
          isError: true,
        });
      }
    }
  }

  hasPreloadedStepData(stepName) {
    const {
      hasLoadedDatabasesWithTables,
      hasLoadedDatabasesWithTablesSaved,
      hasLoadedDatabasesWithSaved,
    } = this.props;
    if (stepName === DATABASE_STEP) {
      return hasLoadedDatabasesWithTablesSaved || hasLoadedDatabasesWithSaved;
    } else if (stepName === SCHEMA_STEP || stepName === TABLE_STEP) {
      return (
        hasLoadedDatabasesWithTablesSaved ||
        (hasLoadedDatabasesWithTables &&
          !this.state.selectedDatabase.is_saved_questions)
      );
    } else if (stepName === FIELD_STEP) {
      return this.state.fields.length > 0;
    }
  }

  switchToStep = async (stepName, stateChange = {}, skipSteps = true) => {
    await this.setStateWithComputedState({
      ...stateChange,
      activeStep: stepName,
    });
    if (!this.hasPreloadedStepData(stepName)) {
      await this.loadStepData(stepName);
    }
    if (skipSteps) {
      await this.skipSteps();
    }
  };

  showSavedEntityPicker = ({ entityType }) =>
    this.setState({
      isSavedEntityPickerShown: true,
      savedEntityType: entityType,
    });

  onChangeDataBucket = async (selectedDataBucketId) => {
    if (selectedDataBucketId === DATA_BUCKET.RAW_DATA) {
      await this.switchToStep(DATABASE_STEP, { selectedDataBucketId });
      return;
    }
    await this.switchToStep(
      DATABASE_STEP,
      {
        selectedDataBucketId,
      },
      false,
    );
    const database = this.props.databases.find((db) => db.is_saved_questions);
    if (database) {
      this.onChangeDatabase(database);
    }
  };

  onChangeDatabase = async (database) => {
    if (database.is_saved_questions) {
      this.showSavedEntityPicker({ entityType: "question" });
      return;
    }

    if (this.props.setDatabaseFn) {
      this.props.setDatabaseFn(database && database.id);
    }

    if (this.state.selectedDatabaseId != null) {
      // If we already had a database selected, we need to go back and clear
      // data before advancing to the next step.
      await this.previousStep();
    }
    await this.nextStep({ selectedDatabaseId: database && database.id });
  };

  onChangeSchema = async (schema) => {
    // NOTE: not really any need to have a setSchemaFn since schemas are just a namespace
    await this.nextStep({ selectedSchemaId: schema && schema.id });
  };

  onChangeTable = async (table) => {
    if (this.props.setSourceTableFn) {
      this.props.setSourceTableFn(table?.id, table?.db_id);
    }
    await this.nextStep({ selectedTableId: table?.id });
  };

  onChangeField = async (field) => {
    if (this.props.setFieldFn) {
      this.props.setFieldFn(field?.id);
    }
    await this.nextStep({ selectedFieldId: field?.id });
  };

  getTriggerElement = (triggerProps) => {
    const {
      className,
      style,
      triggerIconSize,
      triggerElement,
      getTriggerElementContent: TriggerComponent,
      hasTriggerExpandControl,
      readOnly,
      isMantine,
    } = this.props;

    if (triggerElement) {
      return triggerElement;
    }

    const { selectedDatabase, selectedTable, selectedField } = this.state;

    return (
      <Trigger
        className={className}
        style={style}
        showDropdownIcon={!readOnly && hasTriggerExpandControl}
        iconSize={isMantine ? "1rem" : triggerIconSize}
        isMantine={isMantine}
      >
        <TriggerComponent
          database={selectedDatabase}
          table={selectedTable}
          field={selectedField}
          {...triggerProps}
        />
      </Trigger>
    );
  };

  getTriggerClasses() {
    const { readOnly, triggerClasses } = this.props;
    return cx(triggerClasses ?? cx(CS.flex, CS.alignCenter), {
      disabled: readOnly,
    });
  }

  handleSavedEntityPickerClose = () => {
    const { selectedDataBucketId } = this.state;
    if (selectedDataBucketId === DATA_BUCKET.MODELS || this.hasUsableModels()) {
      this.previousStep();
    }
    if (
      selectedDataBucketId === DATA_BUCKET.METRICS ||
      this.hasUsableMetrics()
    ) {
      this.previousStep();
    }
    this.setState({ isSavedEntityPickerShown: false, savedEntityType: null });
  };

  renderActiveStep() {
    const { steps, combineDatabaseSchemaSteps, hasNestedQueriesEnabled } =
      this.props;
    const hasNextStep = this.getNextStep() != null;
    const hasPreviousStep = this.getPreviousStep() != null;
    const hasBackButton =
      hasPreviousStep &&
      steps.includes(DATA_BUCKET_STEP) &&
      this.hasUsableModelsOrMetrics();

    const props = {
      ...this.state,
      databases: this.getDatabases(),

      onChangeDataBucket: this.onChangeDataBucket,
      onChangeDatabase: this.onChangeDatabase,
      onChangeSchema: this.onChangeSchema,
      onChangeTable: this.onChangeTable,
      onChangeField: this.onChangeField,

      // misc
      isLoading: this.state.isLoading,
      hasNextStep,
      onBack: hasPreviousStep ? this.previousStep : null,
      hasFiltering: true,
      hasInitialFocus: true,
    };

    switch (this.state.activeStep) {
      case DATA_BUCKET_STEP:
        return (
          <Box p="sm">
            <DataBucketPicker
              dataTypes={getDataTypes({
                hasModels: this.hasModels(),
                hasTables: this.props.canSelectTable,
                hasNestedQueriesEnabled,
                hasSavedQuestions: this.hasSavedQuestions(),
                hasMetrics: this.hasMetrics(),
              })}
              {...props}
            />
          </Box>
        );
      case DATABASE_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker {...props} hasBackButton={hasBackButton} />
        ) : (
          <DatabasePicker {...props} />
        );
      case SCHEMA_STEP:
        return combineDatabaseSchemaSteps ? (
          <DatabaseSchemaPicker {...props} hasBackButton={hasBackButton} />
        ) : (
          <SchemaPicker {...props} />
        );
      case TABLE_STEP:
        return <TablePicker {...props} />;
      case FIELD_STEP:
        return <FieldPicker {...props} />;
    }

    return null;
  }

  isSavedEntitySelected = () => isVirtualCardId(this.props.selectedTableId);

  handleSavedEntitySelect = async (tableOrCardId) => {
    await this.props.fetchFields(tableOrCardId);
    if (this.props.setSourceTableFn) {
      const table = this.props.metadata.table(tableOrCardId);
      this.props.setSourceTableFn(tableOrCardId, table.db_id);
    }
    this.togglePopoverOpen();
    this.handleClose();
  };

  handleClose = () => {
    const { onClose } = this.props;
    if (typeof onClose === "function") {
      onClose();
    }
  };

  handleDismiss = () => {
    this.handleClose();
    this.setStateWithComputedState({
      isPopoverOpen: false,
    });
  };

  hasDataAccess = () => {
    const { hasDataAccess, databases } = this.props;
    return hasDataAccess || databases?.length > 0;
  };

  renderContent = () => {
    const { isSavedEntityPickerShown, selectedDataBucketId, selectedTable } =
      this.state;
    const { canChangeDatabase, selectedDatabaseId, selectedCollectionId } =
      this.props;

    const currentDatabaseId = canChangeDatabase ? null : selectedDatabaseId;

    const isPickerOpen =
      isSavedEntityPickerShown || selectedDataBucketId === DATA_BUCKET.MODELS;

    if (this.isSearchLoading()) {
      return <LoadingAndErrorWrapper loading />;
    }

    if (this.hasDataAccess()) {
      if (isPickerOpen) {
        return (
          <SavedEntityPicker
            collectionId={selectedCollectionId}
            type={this.getCardType()}
            tableId={selectedTable?.id}
            databaseId={currentDatabaseId}
            onSelect={this.handleSavedEntitySelect}
            onBack={this.handleSavedEntityPickerClose}
          />
        );
      }

      return this.renderActiveStep();
    }

    return (
      <Box w={CONTAINER_WIDTH} p="80px 60px">
        <EmptyState
          message={t`To pick some data, you'll need to add some first`}
          icon="database"
        />
      </Box>
    );
  };

  render() {
    if (this.props.isPopover) {
      const triggerElement = this.getTriggerElement();

      const triggerTargetClassName = cx(
        this.props.containerClassName,
        this.getTriggerClasses(),
      );

      return (
        <Popover
          onClose={this.handleClose}
          onDismiss={this.handleDismiss}
          position="bottom-start"
          opened={this.isPopoverOpen()}
        >
          <Popover.Target>
            <Box
              className={triggerTargetClassName}
              onClick={() => this.togglePopoverOpen()}
            >
              {triggerElement}
            </Box>
          </Popover.Target>

          <Popover.Dropdown>{this.renderContent()}</Popover.Dropdown>
        </Popover>
      );
    }

    return this.renderContent();
  }
}

const DataSelector = _.compose(
  Databases.loadList({
    loadingAndErrorWrapper: false,
    listName: "allDatabases",
  }),
  // If there is at least one model or metric,
  // we want to display a slightly different data picker view
  // (see DATA_BUCKET step)
  Search.loadList({
    query: {
      calculate_available_models: true,
      limit: 0,
      models: ["dataset", "metric"],
    },
    loadingAndErrorWrapper: false,
  }),
  connect(
    (state, ownProps) => ({
      availableModels: ownProps.metadata?.available_models ?? [],
      metadata: getMetadata(state),
      databases:
        ownProps.databases ||
        Databases.selectors.getList(state, {
          entityQuery: ownProps.databaseQuery,
        }) ||
        [],
      hasLoadedDatabasesWithTablesSaved: Databases.selectors.getLoaded(state, {
        entityQuery: { include: "tables", saved: true },
      }),
      hasLoadedDatabasesWithSaved: Databases.selectors.getLoaded(state, {
        entityQuery: { saved: true },
      }),
      hasLoadedDatabasesWithTables: Databases.selectors.getLoaded(state, {
        entityQuery: { include: "tables" },
      }),
      hasDataAccess: getHasDataAccess(ownProps.allDatabases ?? []),
      hasNestedQueriesEnabled: getSetting(state, "enable-nested-queries"),
      selectedQuestion: Questions.selectors.getObject(state, {
        entityId: getQuestionIdFromVirtualTableId(ownProps.selectedTableId),
      }),
    }),
    {
      fetchDatabases: (databaseQuery) =>
        Databases.actions.fetchList(databaseQuery),
      fetchSchemas: (databaseId) =>
        Schemas.actions.fetchList({ dbId: databaseId }),
      fetchSchemaTables: (schemaId) => Schemas.actions.fetch({ id: schemaId }),
      fetchFields: (tableId) => Tables.actions.fetchMetadata({ id: tableId }),
      fetchQuestion: (id) =>
        Questions.actions.fetch({
          id: getQuestionIdFromVirtualTableId(id),
        }),
    },
  ),
)(UnconnectedDataSelector);
