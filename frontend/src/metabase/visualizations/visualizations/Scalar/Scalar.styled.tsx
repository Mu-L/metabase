// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

interface ScalarContainerProps {
  isClickable: boolean;
}

export const ScalarContainer = styled(Ellipsified, {
  shouldForwardProp: (prop) => prop !== "isClickable",
})<ScalarContainerProps>`
  padding: 0 ${space(1)};
  max-width: 100%;
  box-sizing: border-box;

  ${({ isClickable }) =>
    isClickable &&
    css`
      cursor: pointer;

      &:hover {
        color: var(--mb-color-brand);
      }
    `}
`;

export const LabelIcon = styled(Icon)`
  color: var(--mb-color-text-light);
  margin-top: 0.2rem;
`;
