import cx from "classnames";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import PopoverWithTrigger from "metabase/common/components/PopoverWithTrigger";
import {
  type NumberFormatter,
  useNumberFormatter,
} from "metabase/common/hooks/use-number-formatter";
import CS from "metabase/css/core/index.css";
import Database from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import { setLimit } from "metabase/query_builder/actions";
import LimitPopover from "metabase/query_builder/components/LimitPopover";
import {
  getFirstQueryResult,
  getIsResultDirty,
  getQuestion,
} from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";
import type { Limit } from "metabase-lib";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";
import type { Dataset } from "metabase-types/api";
import type { State } from "metabase-types/store";

import QuestionRowCountS from "./QuestionRowCount.module.css";

const POPOVER_ID = "limit-popover";

interface OwnProps {
  className?: string;
}

interface StateProps {
  question: Question;
  result: Dataset;
  isResultDirty: boolean;
}

interface EntityLoaderProps {
  loading: boolean;
}

interface DispatchProps {
  onChangeLimit: (limit: Limit) => void;
}

type QuestionRowCountProps = OwnProps &
  StateProps &
  DispatchProps &
  EntityLoaderProps;

function mapStateToProps(state: State) {
  // Not expected to render before question is loaded
  const question = getQuestion(state) as Question;

  return {
    question,
    result: getFirstQueryResult(state),
    isResultDirty: getIsResultDirty(state),
  };
}

const mapDispatchToProps = {
  onChangeLimit: setLimit,
};

function QuestionRowCount({
  question,
  result,
  isResultDirty,
  loading,
  className,
  onChangeLimit,
}: QuestionRowCountProps) {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const formatNumber = useNumberFormatter();
  const message = useMemo(() => {
    if (isNative) {
      return isResultDirty ? "" : getRowCountMessage(result, formatNumber);
    }
    return isResultDirty
      ? getLimitMessage(question, result, formatNumber)
      : getRowCountMessage(result, formatNumber);
  }, [question, result, isResultDirty, isNative, formatNumber]);

  const handleLimitChange = (limit: number) => {
    onChangeLimit(limit > 0 ? limit : null);
  };

  const canChangeLimit = !isNative && isEditable;

  const limit = canChangeLimit ? Lib.currentLimit(question.query(), -1) : null;

  if (loading) {
    return null;
  }

  return (
    <PopoverWithTrigger
      triggerElement={
        <RowCountLabel
          className={className}
          data-testid="question-row-count"
          highlighted={limit != null}
          disabled={!canChangeLimit}
        >
          {message}
        </RowCountLabel>
      }
      id={POPOVER_ID}
      aria-role="dialog"
      disabled={!canChangeLimit}
    >
      {({ onClose }: { onClose: () => void }) => (
        <LimitPopover
          className={CS.p2}
          limit={limit}
          onChangeLimit={handleLimitChange}
          onClose={onClose}
        />
      )}
    </PopoverWithTrigger>
  );
}

function RowCountLabel({
  disabled,
  className,
  ...props
}: {
  children: string;
  highlighted: boolean;
  disabled: boolean;
  className?: string;
}) {
  const label = t`Row count`;
  const { highlighted, ...propsForChild } = props;
  return disabled ? (
    <Box
      component="span"
      className={cx(QuestionRowCountS.RowCountStaticLabel, className)}
      {...propsForChild}
      aria-label={label}
    />
  ) : (
    <button
      className={cx(
        QuestionRowCountS.RowCountButton,
        {
          [QuestionRowCountS.isHighlighted]: highlighted,
        },
        className,
      )}
      {...propsForChild}
      aria-label={label}
      aria-haspopup="dialog"
      aria-controls={POPOVER_ID}
    />
  );
}

const formatRowCount = (count: number, formatNumber: NumberFormatter) => {
  const countString = formatNumber(count);
  return ngettext(msgid`${countString} row`, `${countString} rows`, count);
};

function getLimitMessage(
  question: Question,
  result: Dataset,
  formatNumber: NumberFormatter,
): string {
  const limit = Lib.currentLimit(question.query(), -1);
  const isValidLimit =
    typeof limit === "number" && limit > 0 && limit < HARD_ROW_LIMIT;

  if (isValidLimit) {
    return t`Show ${formatRowCount(limit, formatNumber)}`;
  }

  const hasValidRowCount =
    typeof result.row_count === "number" && result.row_count > 0;

  if (hasValidRowCount) {
    // The query has been altered but we might still have the old result set,
    // so show that instead of a generic HARD_ROW_LIMIT
    return t`Showing ${formatRowCount(result.row_count, formatNumber)}`;
  }

  return t`Showing first ${formatRowCount(HARD_ROW_LIMIT, formatNumber)} rows`;
}

function getRowCountMessage(result: Dataset, formatNumber: NumberFormatter) {
  if (result.data.rows_truncated > 0) {
    return t`Showing first ${formatRowCount(result.row_count, formatNumber)}`;
  }
  if (result.row_count === HARD_ROW_LIMIT) {
    return t`Showing first ${formatRowCount(HARD_ROW_LIMIT, formatNumber)} rows`;
  }
  return t`Showing ${formatRowCount(result.row_count, formatNumber)}`;
}

function getDatabaseId(_state: State, { question }: OwnProps & StateProps) {
  return question.databaseId();
}

const ConnectedQuestionRowCount = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Database.load({
    id: getDatabaseId,
    loadingAndErrorWrapper: false,
  }),
)(QuestionRowCount);

export type QuestionRowCountOpts = {
  result?: Dataset;
  isObjectDetail: boolean;
};

function shouldRender({ result, isObjectDetail }: QuestionRowCountOpts) {
  return result?.data && !isObjectDetail;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(ConnectedQuestionRowCount, { shouldRender });
